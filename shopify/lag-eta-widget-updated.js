(function(){
  const root = document.querySelector('[data-lag-eta]');
  if (!root) return;
  if (root.dataset.etaBound === "1") return;
  root.dataset.etaBound = "1";

  // Card elements
  const $enterBtn        = root.querySelector('[data-open-picker]');
  const $enterHint       = root.querySelector('[data-enter-hint]');
  const $filledWrap      = root.querySelector('[data-eta-filled]');
  const $primary         = root.querySelector('[data-eta-primary]');
  const $bydate          = root.querySelector('[data-eta-bydate]');
  const $editPinBtn      = root.querySelector('[data-edit-pin]');
  const $intlWrap        = root.querySelector('[data-eta-intl]');
  const $intlPlace       = root.querySelector('[data-intl-place]');
  const $intlPlaceShort  = root.querySelector('[data-intl-place-short]');
  const $intlMatrix      = root.querySelector('.lag-eta-intl .eta-matrix');

  const $stdPrefix       = root.querySelector('[data-intl-standard-prefix]');
  const $stdDays         = root.querySelector('[data-intl-standard-days]');
  const $exprDays        = root.querySelector('[data-intl-express-days]');

  const $countryLink     = root.querySelector('[data-change-country]');
  const $countryPicker   = root.querySelector('[data-country-picker]');
  const $countrySelect   = root.querySelector('[data-country-select]');
  const $countryApply    = root.querySelector('[data-country-apply]');
  const $intlFromIndia   = root.querySelector('[data-intl-from-india]');
  const $intlFromEmpty   = root.querySelector('[data-intl-from-empty]');

  let openedFromIndia = false;

  // Modal elements
  const $modal    = document.querySelector('[data-eta-modal]');
  if (!$modal) return;

  try{
    if ($intlFromEmpty) $intlFromEmpty.hidden = !window.LAG_ETA_INTL_ENABLE;
    if ($intlFromModal) $intlFromModal.hidden = !window.LAG_ETA_INTL_ENABLE;
  }catch(e){}

  const $dialog        = $modal.querySelector('.lag-eta-modal__dialog');
  const $closes        = $modal.querySelectorAll('[data-eta-close]');
  const $pinInput      = $modal.querySelector('#lagEtaPin');
  const $applyBtn      = $modal.querySelector('[data-action="check"]');
  const $error         = $modal.querySelector('[data-eta-error]');
  const $intlFromModal = $modal.querySelector('[data-intl-from-modal]');
  const $countryCancel = root.querySelector('[data-country-cancel]');

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED GEO CACHE — same localStorage keys as hero banner
  // ─────────────────────────────────────────────────────────────────────────
  const GEO_CACHE_KEY  = 'lag_geo_cache';
  const PERM_ASKED_KEY = 'lag_geo_asked';
  const CACHE_VERSION  = 'v1';
  const CACHE_TTL_MS   = 30 * 24 * 60 * 60 * 1000; // 30 days

  // Google key is now server-side only — no longer exposed to the browser
  const GEO_API_URL = 'https://lagorii-geo-api.vercel.app/api/geo';

  const WIDGET_COUNTRY_MAP = {
    IN:"India", US:"United States", CA:"Canada", GB:"United Kingdom",
    AE:"United Arab Emirates", SG:"Singapore", AU:"Australia", NZ:"New Zealand",
    MY:"Malaysia", DE:"Germany", FR:"France", QA:"Qatar", SA:"Saudi Arabia",
    ZA:"South Africa", LK:"Sri Lanka"
  };

  function coordKey(lat, lng){
    return `${parseFloat(lat).toFixed(2)},${parseFloat(lng).toFixed(2)}`;
  }

  function readGeoCache(lat, lng){
    try{
      const raw = localStorage.getItem(GEO_CACHE_KEY);
      if (!raw) return null;
      const store = JSON.parse(raw);
      const slots = store.slots || [];
      const found = slots.find(s => s.key === coordKey(lat, lng));
      if (!found) return null;
      if (Date.now() - (found.savedAt || 0) > CACHE_TTL_MS){
        const idx = slots.indexOf(found);
        slots.splice(idx, 1);
        localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ slots }));
        return null;
      }
      if (found.version !== CACHE_VERSION){
        const idx = slots.indexOf(found);
        slots.splice(idx, 1);
        localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ slots }));
        return null;
      }
      return found.result;
    }catch(e){ return null; }
  }

  function writeGeoCache(lat, lng, result){
    try{
      const raw   = localStorage.getItem(GEO_CACHE_KEY);
      const store = raw ? JSON.parse(raw) : { slots: [] };
      const slots = store.slots || [];
      const key   = coordKey(lat, lng);
      const idx   = slots.findIndex(s => s.key === key);
      if (idx !== -1) slots.splice(idx, 1);
      if (slots.length >= 5) slots.shift();
      slots.push({ key, result, savedAt: Date.now(), version: CACHE_VERSION });
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ slots }));
    }catch(e){}
  }

  function hasAskedPermission(){
    try{ return sessionStorage.getItem(PERM_ASKED_KEY) === '1'; }catch(e){ return false; }
  }

  function getCurrentPosition(opts){
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation){ reject(new Error('no-geolocation')); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject,
        opts || { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  // Calls our Vercel server; falls back to Nominatim if server is unavailable
  async function reverseGeocodeWidget(lat, lng){
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        `${GEO_API_URL}?lat=${lat}&lng=${lng}`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      if (!res.ok) throw new Error('Server ' + res.status);
      const data = await res.json();
      if (data.fallback) throw new Error('Server fallback');
      return data;
    } catch (serverErr) {
      // Nominatim fallback — only used if our server is down
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'LagoriETA/2.0' } });
        if (!res.ok) throw new Error('Nominatim');
        const data = await res.json();
        const addr = data.address || {};
        return {
          pincode:     (addr.postcode || '').replace(/\D+/g, '').slice(0, 6),
          countryCode: (addr.country_code || '').toUpperCase(),
          city:        addr.city || addr.town || addr.village || null,
          locality:    addr.suburb || addr.neighbourhood || null,
        };
      } catch (e) {
        return null;
      }
    }
  }

  async function getPermissionState(){
    try{
      if (!navigator.permissions) return 'prompt';
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state;
    }catch(e){ return 'prompt'; }
  }

  // ── "Use current location" button for widget modal ──
  let $widgetLocBtn = null;

  function injectWidgetLocationButton(){
    if ($widgetLocBtn) return;
    const pinRow = $modal.querySelector('.lag-eta-row--modal');
    if (!pinRow) return;

    $widgetLocBtn = document.createElement('button');
    $widgetLocBtn.type = 'button';
    $widgetLocBtn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:none;border:1px solid currentColor;border-radius:8px;padding:7px 12px;font-size:13px;cursor:pointer;opacity:0.75;margin-bottom:10px;width:100%;justify-content:center';
    $widgetLocBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>Use current location';
    $widgetLocBtn.addEventListener('click', handleWidgetLocationClick);

    pinRow.insertBefore($widgetLocBtn, pinRow.firstChild);
  }

  async function handleWidgetLocationClick(){
    if (!$widgetLocBtn) return;
    const original = $widgetLocBtn.innerHTML;
    $widgetLocBtn.disabled = true;
    $widgetLocBtn.innerHTML = '<span style="opacity:.6">Detecting location...</span>';

    try{
      const pos = await getCurrentPosition({ enableHighAccuracy:false, timeout:10000, maximumAge:30000 });
      const { latitude: lat, longitude: lng } = pos.coords;

      const cached = readGeoCache(lat, lng);
      if (cached){
        if (cached.type === 'india' && cached.pin){
          const rec = await window.LagETA.byPin(cached.pin);
          if (rec){ showFilled(rec); closeModal(); }
          else showError('Pincode not serviceable. Please enter manually.');
          return;
        }
        if (cached.type === 'intl' && cached.countryCode){
          const det = { countryCode: cached.countryCode, countryName: cached.countryName };
          renderIntl(det);
          closeModal();
          return;
        }
      }

      const geoResult = await reverseGeocodeWidget(lat, lng);
      if (!geoResult){ showError('Could not detect location. Please enter manually.'); return; }

      const { pincode, countryCode, city, locality } = geoResult;

      if (countryCode === 'IN'){
        if (pincode && pincode.length === 6){
          if ($pinInput) $pinInput.value = pincode;
          clearError();
          const rec = await window.LagETA.byPin(pincode);
          if (rec){
            writeGeoCache(lat, lng, {
              type: 'india',
              pin: pincode,
              city: rec.city || city || null,
              locality: rec.locality || locality || null
            });
            showFilled(rec);
            closeModal();
          } else {
            showError('Pincode detected but not serviceable. Please enter manually.');
          }
        } else {
          showError('Could not resolve pincode. Please enter manually.');
        }
      } else if (countryCode && WIDGET_COUNTRY_MAP[countryCode]){
        writeGeoCache(lat, lng, {
          type: 'intl',
          countryCode: countryCode,
          countryName: WIDGET_COUNTRY_MAP[countryCode]
        });
        const det = { countryCode, countryName: WIDGET_COUNTRY_MAP[countryCode] };
        renderIntl(det);
        closeModal();
      } else {
        showError('Country not supported. Please select manually.');
      }

    }catch(e){
      showError('Location access denied. Please enter manually.');
    }finally{
      $widgetLocBtn.disabled = false;
      $widgetLocBtn.innerHTML = original;
    }
  }

  new MutationObserver(async () => {
    if (!$modal.hidden && hasAskedPermission() && navigator.geolocation){
      const state = await getPermissionState();
      if (state === 'denied'){
        if ($widgetLocBtn) $widgetLocBtn.style.display = 'none';
        return;
      }
      injectWidgetLocationButton();
      if ($widgetLocBtn) $widgetLocBtn.style.display = 'inline-flex';
    }
  }).observe($modal, { attributes:true, attributeFilter:['hidden'] });

  // ─────────────────────────────────────────────────────────────────────────
  // ORIGINAL WIDGET CODE BELOW — UNCHANGED EXCEPT reverseGeocode ABOVE
  // ─────────────────────────────────────────────────────────────────────────

  const normPin     = v => (v||'').toString().replace(/\D+/g,'');
  const shortState  = s => s ? s.slice(0,2).toUpperCase() : "";
  function addDays(date, n){ const d=new Date(date.getTime()); d.setDate(d.getDate()+n); return d; }

  function normBucket(b){
    if (typeof b === "number" && isFinite(b)) return `${Math.round(b)}-days`;
    if (b && typeof b === "object") {
      if (b.type === "days" && b.value != null) return `${Math.round(Number(b.value))}-days`;
      if (b.type === "label" && b.value) return String(b.value);
    }
    return String(b ?? "");
  }

  function shortLabel(bucket){
    if (!bucket) return "SOON";
    const m = {
      "60-min":"2-Hours", "same-day":"24HRS",
      "2-days":"2 DAYS", "3-days":"3 DAYS", "4-days":"4 DAYS",
      "5-days":"5 DAYS", "6-days":"6 DAYS", "7-days":"7 DAYS", "8-days":"8 DAYS"
    };
    if (m[bucket]) return m[bucket];
    const n = String(bucket).match(/^(\d+)-days$/);
    return n ? `${n[1]} DAYS` : "SOON";
  }

  function setMode(mode){
    if (!root) return;
    if (mode) root.setAttribute('data-mode', mode);
    else root.removeAttribute('data-mode');
  }

  function isMetroPin(pinRaw, stateCode){
    const pin = String(pinRaw || '');
    const st  = (stateCode || '').toUpperCase();
    if (st === "KA" && (pin.startsWith("560") || pin.startsWith("5621"))) return true;
    if (st === "MH" && (pin.startsWith("400") || pin.startsWith("401"))) return true;
    if (st === "MH" && pin.startsWith("411")) return true;
    if (st === "DL" && pin.startsWith("110")) return true;
    if (st === "TN" && pin.startsWith("600")) return true;
    if (st === "TS" && pin.startsWith("500")) return true;
    if (st === "WB" && pin.startsWith("700")) return true;
    return false;
  }

  function byDate(bucket){
    const now = new Date();
    if (bucket === "60-min")   return " in 2-Hours";
    if (bucket === "same-day") return " today";
    const m = /^(\d+)-days$/.exec(String(bucket || ""));
    const n = m ? parseInt(m[1], 10) : 3;
    const d = addDays(now, n);
    const fmt = d.toLocaleString(undefined,{month:"long", day:"2-digit"});
    return " by " + fmt;
  }

  function formatDatePlusDays(days){
    const now = new Date();
    const d   = addDays(now, days);
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  }

  const COUNTRY_MAP = {
    IN:"India", US:"United States", CA:"Canada", GB:"United Kingdom",
    AE:"United Arab Emirates", SG:"Singapore", AU:"Australia", NZ:"New Zealand",
    MY:"Malaysia", DE:"Germany", FR:"France", QA:"Qatar", SA:"Saudi Arabia",
    ZA:"South Africa", LK:"Sri Lanka"
  };

  const POPULAR_CODES = (window.LAG_ETA_INTL_POPULAR || "US,CA,AE,SG,AU,GB")
    .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);

  const INTL_STORE_KEY = 'lag_eta_intl';

  function saveIntlSelection(det){
    try { localStorage.setItem(INTL_STORE_KEY, JSON.stringify(det)); } catch(e){}
  }
  function loadIntlSelection(){
    try {
      const v = localStorage.getItem(INTL_STORE_KEY);
      return v ? JSON.parse(v) : null;
    } catch(e){ return null; }
  }

  function clearError(){
    if ($error){ $error.hidden = true; $error.textContent = ""; }
  }

  function showError(msg){
    if (!$error) return;
    $error.textContent = msg;
    $error.hidden = false;
  }

  function showEmpty(){
    setMode('empty');
    if ($enterBtn){ $enterBtn.hidden = false; $enterBtn.setAttribute('aria-hidden','false'); $enterBtn.style.display = ''; }
    if ($enterHint)  $enterHint.hidden  = false;
    if ($intlFromEmpty) $intlFromEmpty.hidden = !window.LAG_ETA_INTL_ENABLE;
    if ($filledWrap) $filledWrap.hidden = true;
    if ($intlWrap)   $intlWrap.hidden   = true;
  }

  function showFilled(rec){
    const sig = [rec.pin, rec.express || '', rec.standard || '', rec.timeline || ''].join('|');
    if (root.dataset.etaSig === sig) return;
    root.dataset.etaSig = sig;

    setMode('domestic');
    saveIntlSelection(null);

    const stCode  = rec.stateCode || shortState(rec.state);
    const isMetro = isMetroPin(rec.pin, stCode);
    const isSixty = rec.timeline === "60-min";
    const cityST  = [rec.city, stCode].filter(Boolean).join(", ");
    const $note   = root.querySelector('[data-eta-note]');

    function renderNote(expBucket, stdBucket){
      if (!$note) return;
      const rows = [];
      if (expBucket) rows.push(`<div><strong>Express:</strong> <span class="eta-days">${shortLabel(expBucket)}</span></div>`);
      if (stdBucket) rows.push(`<div><strong>Standard:</strong> <span class="eta-days">${shortLabel(stdBucket)}</span></div>`);
      if (rows.length){ $note.innerHTML = rows.join(''); $note.hidden = false; }
      else $note.hidden = true;
    }

    if ($intlWrap) $intlWrap.hidden = true;

    const expBucket = rec.express || rec.timeline || "";
    const stdBucket = (typeof rec.standard === "string" && rec.standard) ? rec.standard : "";

    if (isSixty){
      const etaDate = formatDatePlusDays(1);
      $primary.innerHTML = `Get this product within <strong>${shortLabel(expBucket)}</strong>`;
      $editPinBtn.textContent = rec.pin;
      $bydate.textContent = `by ${etaDate}${cityST ? ` — ${cityST}` : ""}`;
      renderNote(expBucket, stdBucket);
    } else if (isMetro){
      const etaDate = formatDatePlusDays(4);
      $primary.innerHTML = `Fast shipping within <strong>24HRS</strong>`;
      $editPinBtn.textContent = rec.pin;
      $bydate.textContent = `by ${etaDate}${cityST ? ` — ${cityST}` : ""}`;
      renderNote(expBucket, stdBucket);
    } else {
      const dur = shortLabel(rec.timeline);
      $primary.innerHTML = `Get this product within <strong>${dur}</strong>`;
      $editPinBtn.textContent = rec.pin;
      $bydate.textContent = (byDate(rec.timeline) || "") + (cityST ? ` — ${cityST}` : "");
      renderNote(expBucket, stdBucket);
    }

    if ($enterBtn){ $enterBtn.hidden = true; $enterBtn.setAttribute('aria-hidden','true'); $enterBtn.style.display = 'none'; }
    if ($enterHint)     $enterHint.hidden     = true;
    if ($intlFromEmpty) $intlFromEmpty.hidden = true;
    if ($filledWrap)    $filledWrap.hidden    = false;
  }

  if (!window.__lagEtaEventBound2) {
    window.__lagEtaHydratedPins = window.__lagEtaHydratedPins || new Set();

    const schedule = (fn) => {
      if (root.__etaRaf) cancelAnimationFrame(root.__etaRaf);
      root.__etaRaf = requestAnimationFrame(fn);
    };

    window.addEventListener('lag:eta', function (ev) {
      try {
        const detail = ev.detail || {};
        const rec = detail.result || detail;
        if (!rec || !rec.pin) return;
        const sig = [rec.pin, rec.express || '', rec.standard || '', rec.timeline || ''].join('|');
        if (root.dataset.etaSig === sig) return;
        const needsHydration = (!rec.express || !rec.standard);
        if (needsHydration && !window.__lagEtaHydratedPins.has(rec.pin)) {
          window.__lagEtaHydratedPins.add(rec.pin);
          if (window.LagETA && typeof window.LagETA.byPin === 'function') {
            window.LagETA.byPin(rec.pin)
              .then((full) => schedule(() => showFilled(full || rec)))
              .catch(()   => schedule(() => showFilled(rec)));
            return;
          }
        }
        schedule(() => showFilled(rec));
      } catch (e) {
        console.warn('[Widget ETA] lag:eta listener error', e);
      }
    });

    window.__lagEtaEventBound2 = true;
  }

  function renderIntl(det){
    if (!window.LAG_ETA_INTL_ENABLE) return;
    if (!$intlWrap) return;
    setMode('intl');
    const code  = (det.countryCode || det.country || "").toString().toUpperCase();
    const name  = det.countryName || COUNTRY_MAP[code] || code || "your country";
    const city  = det.city ? det.city.toString().trim() : "";
    const place = city ? `${city}, ${name}` : name;
    if ($intlPlace)      $intlPlace.textContent      = place;
    if ($intlPlaceShort) $intlPlaceShort.textContent = place;
    saveIntlSelection({ countryCode: code, countryName: name });
    if ($filledWrap) $filledWrap.hidden = true;
    if ($enterBtn){ $enterBtn.hidden = true; $enterBtn.setAttribute('aria-hidden','true'); $enterBtn.style.display = 'none'; }
    if ($enterHint)     $enterHint.hidden     = true;
    if ($intlFromEmpty) $intlFromEmpty.hidden = true;
    if ($intlMatrix)    $intlMatrix.hidden    = false;
    $intlWrap.hidden = false;
  }

  function buildCountryOptions(){
    if (!$countrySelect) return;
    $countrySelect.innerHTML = "";
    const seen = new Set();
    function add(code){
      const c = code.toUpperCase();
      if (!COUNTRY_MAP[c] || seen.has(c)) return;
      seen.add(c);
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = COUNTRY_MAP[c];
      $countrySelect.appendChild(opt);
    }
    POPULAR_CODES.forEach(add);
    if (!seen.has('IN')) add('IN');
    Object.keys(COUNTRY_MAP).filter(c => !seen.has(c)).sort((a,b)=>COUNTRY_MAP[a].localeCompare(COUNTRY_MAP[b])).forEach(add);
  }

  function openPinModal(){
    if (window.matchMedia('(max-width: 767px)').matches) $dialog.classList.add('is-drawer');
    else $dialog.classList.remove('is-drawer');
    clearError();
    try{
      const cached = (window.LagETA && typeof window.LagETA.getCookie === 'function') ? window.LagETA.getCookie() : null;
      if ($pinInput) $pinInput.value = cached && cached.pin ? cached.pin : '';
    }catch(e){}
    $modal.hidden = false;
    document.body.style.overflow = 'hidden';
    if ($pinInput) setTimeout(function(){ $pinInput.focus(); }, 0);
  }

  function closeModal(){
    $modal.hidden = true;
    document.body.style.overflow = '';
  }

  if ($enterBtn)  $enterBtn.addEventListener('click', openPinModal);
  if ($editPinBtn) $editPinBtn.addEventListener('click', openPinModal);

  $closes.forEach(el=>el.addEventListener('click', closeModal));

  $applyBtn.addEventListener('click', async ()=>{
    clearError();
    const p = normPin($pinInput.value);
    if (p.length !== 6){
      const msg = (window.LAG_ETA_TEXT && window.LAG_ETA_TEXT.invalidPin) || "Not a valid pincode. Please enter a 6-digit PIN.";
      showError(msg); return;
    }
    try{
      const res = await window.LagETA.byPin(p);
      if (res){ showFilled(res); closeModal(); }
      else {
        const msg = (window.LAG_ETA_TEXT && window.LAG_ETA_TEXT.unserviceablePin) || "We couldn't find this pincode. Please enter a valid Indian PIN code.";
        showError(msg);
      }
    }catch(e){
      const msg = (window.LAG_ETA_TEXT && window.LAG_ETA_TEXT.unserviceablePin) || "We couldn't find this pincode. Please enter a valid Indian PIN code.";
      showError(msg);
    }
  });

  function whenReady(fn){
    if (window.LagETA && window.LagETA.ready && window.LagETA.ready()) { fn(); return; }
    window.addEventListener('lageta:ready', fn, {once:true});
  }

  async function initCard(){
    const intlSaved = loadIntlSelection();
    if (window.LAG_ETA_INTL_ENABLE && intlSaved && intlSaved.countryCode){
      const code = intlSaved.countryCode.toString().toUpperCase();
      if (code && code !== 'IN'){ renderIntl({ countryCode: code, countryName: intlSaved.countryName || code }); return; }
    }
    const cached = window.LagETA.getCookie && window.LagETA.getCookie();
    if (cached && cached.pin){
      try {
        const fresh = await window.LagETA.byPin(cached.pin);
        if (fresh && typeof window.LagETA.setCookie === "function"){
          window.LagETA.setCookie({ ...fresh, express: fresh.express || fresh.timeline, standard: fresh.standard });
        }
        showFilled(fresh || cached);
      } catch { showFilled(cached); }
      return;
    }
    showEmpty();
  }

  whenReady(initCard);

  function openIntlPickerFromIndia(){
    if (!window.LAG_ETA_INTL_ENABLE) return;
    if (!$countryPicker || !$countrySelect) return;
    openedFromIndia = true;
    buildCountryOptions();
    const saved = loadIntlSelection();
    if (saved && saved.countryCode) $countrySelect.value = saved.countryCode;
    else if ($countrySelect.options.length) $countrySelect.value = $countrySelect.options[0].value;
    try{ if ($modal && !$modal.hidden) closeModal(); }catch(e){}
    setMode('intl');
    if ($filledWrap) $filledWrap.hidden = true;
    if ($enterBtn){ $enterBtn.hidden = true; $enterBtn.setAttribute('aria-hidden','true'); $enterBtn.style.display = 'none'; }
    if ($enterHint) $enterHint.hidden = true;
    if ($intlFromEmpty) $intlFromEmpty.hidden = true;
    if ($intlWrap)   $intlWrap.hidden   = false;
    if ($intlMatrix) $intlMatrix.hidden = true;
    $countryPicker.hidden = false;
    try{ setTimeout(()=>{ $countrySelect.focus(); }, 0); }catch(e){}
  }

  if ($countryLink && $countryPicker && $countrySelect){
    $countryLink.addEventListener('click', ()=>{
      if (!window.LAG_ETA_INTL_ENABLE) return;
      openedFromIndia = false;
      buildCountryOptions();
      const saved = loadIntlSelection();
      if (saved && saved.countryCode) $countrySelect.value = saved.countryCode;
      if ($intlMatrix) $intlMatrix.hidden = true;
      $countryPicker.hidden = false;
    });
  }

  if ($intlFromIndia)  $intlFromIndia.addEventListener('click', openIntlPickerFromIndia);
  if ($intlFromEmpty)  $intlFromEmpty.addEventListener('click', openIntlPickerFromIndia);
  if ($intlFromModal)  $intlFromModal.addEventListener('click', openIntlPickerFromIndia);

  if ($countryApply && $countrySelect){
    $countryApply.addEventListener('click', ()=>{
      const code = ($countrySelect.value || '').toUpperCase();
      if (!code) return;
      openedFromIndia = false;
      if (code === 'IN'){
        if ($intlWrap) $intlWrap.hidden = true;
        $countryPicker.hidden = true;
        showEmpty();
        openPinModal();
      } else {
        const det = { country: code, countryCode: code, countryName: COUNTRY_MAP[code] || code };
        renderIntl(det);
        $countryPicker.hidden = true;
      }
    });
  }

  if ($countryCancel && $countryPicker){
    $countryCancel.addEventListener('click', ()=>{
      if (openedFromIndia){
        openedFromIndia = false;
        $countryPicker.hidden = true;
        const cached = window.LagETA.getCookie && window.LagETA.getCookie();
        if (cached && cached.pin) showFilled(cached);
        else showEmpty();
        return;
      }
      $countryPicker.hidden = true;
      if ($intlMatrix) $intlMatrix.hidden = false;
    });
  }

})();
