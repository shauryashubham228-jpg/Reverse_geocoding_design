<script>
(function(){
  const root = document.getElementById('lag-hero-eta-{{ section.id }}');
  if (!root) return;
  if (root.dataset.heroEtaBound === "1") return;
  root.dataset.heroEtaBound = "1";

  // Google key is now server-side only — no longer exposed to the browser
  const GEO_API_URL    = 'https://lagorii-geo-api.vercel.app/api/geo';
  const GEO_CACHE_KEY  = 'lag_geo_cache';
  const PERM_ASKED_KEY = 'lag_geo_asked';

  // ── Cache version — bump this (e.g. "v2") whenever you change delivery timelines
  const CACHE_VERSION  = 'v1';

  // ── Cache expiry — 30 days in milliseconds
  const CACHE_TTL_MS   = 30 * 24 * 60 * 60 * 1000;

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
  function markPermissionAsked(){
    try{ sessionStorage.setItem(PERM_ASKED_KEY, '1'); }catch(e){}
  }

  // Calls our Vercel server; falls back to Nominatim if server is unavailable
  async function reverseGeocode(lat, lng){
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
        if (!res.ok) throw new Error('Nominatim HTTP ' + res.status);
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

  function getCurrentPosition(opts){
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation){ reject(new Error('no-geolocation')); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject,
        opts || { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  const INTL_STORE_KEY    = 'lag_eta_intl';
  const INTL_SUMMARY_DAYS = {{ settings.lag_eta_intl_standard_days | default: "7-10 business days" | json }};
  const intlEnabled = () => (window.LAG_ETA_INTL_ENABLE !== false);
  const INTL_EVENT = 'lag:eta:intl';

  function emitIntlEvent(det){
    try{ window.dispatchEvent(new CustomEvent(INTL_EVENT, { detail: det || null })); }catch(e){}
  }

  const COUNTRY_MAP = {
    IN:"India", US:"United States", CA:"Canada", GB:"United Kingdom",
    AE:"United Arab Emirates", SG:"Singapore", AU:"Australia", NZ:"New Zealand",
    MY:"Malaysia", DE:"Germany", FR:"France", QA:"Qatar", SA:"Saudi Arabia",
    ZA:"South Africa", LK:"Sri Lanka"
  };

  const POPULAR_CODES = (window.LAG_ETA_INTL_POPULAR || "US,CA,AE,SG,AU,GB")
    .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);

  function saveIntlSelection(det, broadcast = true){
    try{
      if (!det){ localStorage.removeItem(INTL_STORE_KEY); if (broadcast) emitIntlEvent(null); return; }
      localStorage.setItem(INTL_STORE_KEY, JSON.stringify(det));
      if (broadcast) emitIntlEvent(det);
    }catch(e){}
  }
  function loadIntlSelection(){
    try{ return JSON.parse(localStorage.getItem(INTL_STORE_KEY) || 'null'); }catch(e){ return null; }
  }
  function clearIntlSelection(){ saveIntlSelection(null, true); }

  // DOM refs — assigned in initDOM()
  let $open, $hint, $filled, $line1, $cta, $pinEl, $placeEl;
  let $intlOpen, $changeCountry, $editBtn;
  let $modal, $dialog, $pinInput, $applyBtn, $error;
  let $indiaWrap, $switchIntl, $countryWrap, $divider;
  let $countrySelect, $countryApply, $countryClear, $closes;
  let $useLocBtn = null;

  function initDOM(){
    $open    = root.querySelector('[data-open]');
    $hint    = root.querySelector('[data-hint]');
    $filled  = root.querySelector('[data-filled]');
    $line1   = root.querySelector('[data-line1]');
    $cta     = root.querySelector('[data-cta]');
    $pinEl   = root.querySelector('[data-pin]');
    $placeEl = root.querySelector('[data-place]');
    $intlOpen      = root.querySelector('[data-hero-intl-open]');
    $changeCountry = root.querySelector('[data-hero-change-country]');
    $editBtn       = root.querySelector('[data-edit]');
    $modal    = root.querySelector('[data-eta-modal]');
    $dialog   = $modal && $modal.querySelector('.lag-eta-modal__dialog');
    $pinInput = $modal && $modal.querySelector('#lagEtaPin');
    $applyBtn = $modal && $modal.querySelector('[data-action="check"]');
    $error    = $modal && $modal.querySelector('[data-eta-error]');
    $indiaWrap     = $modal && $modal.querySelector('[data-hero-india]');
    $switchIntl    = $modal && $modal.querySelector('[data-hero-switch-intl]');
    $countryWrap   = $modal && $modal.querySelector('[data-hero-country]');
    $divider       = $modal && $modal.querySelector('[data-hero-divider]');
    $countrySelect = $modal && $modal.querySelector('[data-country-select]');
    $countryApply  = $modal && $modal.querySelector('[data-country-apply]');
    $countryClear  = $modal && $modal.querySelector('[data-country-clear]');
    $closes        = $modal ? $modal.querySelectorAll('[data-eta-close]') : [];
  }

  const normPin = v => (v||'').toString().replace(/\D+/g,'').slice(0,6);

  function addDays(date, n){ const d=new Date(date.getTime()); d.setDate(d.getDate()+n); return d; }
  function durationText(tl){
    switch(tl){
      case '60-min':   return '60 mins';
      case 'same-day': return 'today';
      case '2-days':   return '2 days';
      case '4-days':   return '4 days';
      case '6-days':   return '6 days';
      case '8-days':   return '8 days';
      default:         return 'soon';
    }
  }
  function dateSuffix(tl){
    if (tl === '60-min' || tl === 'same-day') return '';
    const map = {'2-days':2,'4-days':4,'6-days':6,'8-days':8};
    const d = addDays(new Date(), map[tl] || 3);
    return d.toLocaleString(undefined,{month:'long', day:'2-digit'});
  }

  function showEmpty(){
    $filled && $filled.setAttribute('hidden','');
    $hint && $hint.removeAttribute('hidden');
    if ($cta) $cta.style.display = 'none';
    if ($open){ $open.removeAttribute('hidden'); $open.style.display='inline-flex'; $open.removeAttribute('aria-hidden'); }
    if ($editBtn) $editBtn.style.display = 'none';
    if ($intlOpen){ const e=intlEnabled(); $intlOpen.hidden=!e; $intlOpen.style.display=e?'inline-flex':'none'; }
    if ($changeCountry){ $changeCountry.hidden=true; $changeCountry.style.display='none'; }
  }

  function render(rec){
    if (!rec){ showEmpty(); return; }
    saveIntlSelection(null, false);
    let line1;
    if (rec.timeline === 'same-day')     line1 = 'Get it by today';
    else if (rec.timeline === '60-min')  line1 = 'Get it in 2-hours';
    else { const dur=durationText(rec.timeline); const date=dateSuffix(rec.timeline); line1=date?`Get it by ${dur}, ${date}`:`Get it by ${dur}`; }
    if ($line1)  $line1.textContent = line1;
    if ($pinEl)  $pinEl.textContent = String(rec.pin || '');
    if ($placeEl){ const place=[rec.city,(rec.locality||rec.area||'')].filter(Boolean).join(', ').trim(); $placeEl.textContent=place?` ${place}`:''; }
    if ($open){ $open.setAttribute('hidden',''); $open.style.display='none'; $open.setAttribute('aria-hidden','true'); }
    $hint && $hint.setAttribute('hidden','');
    $filled && $filled.removeAttribute('hidden');
    if ($intlOpen){ $intlOpen.hidden=true; $intlOpen.style.display='none'; }
    if ($changeCountry){ $changeCountry.hidden=true; $changeCountry.style.display='none'; }
    if ($editBtn) $editBtn.style.display='inline-flex';
    if ($cta) $cta.style.display=(rec.timeline==='60-min')?'inline-flex':'none';
  }

  function renderIntlLine(det){
    if (!det){ showEmpty(); return; }
    const code = (det.countryCode||det.country||'').toString().toUpperCase();
    const name = det.countryName||code||'your country';
    const days = INTL_SUMMARY_DAYS||'7-10 business days';
    if ($line1)  $line1.textContent = `Delivery to ${name}, ${days}.`;
    if ($pinEl)   $pinEl.textContent = '';
    if ($placeEl) $placeEl.textContent = '';
    if ($open){ $open.setAttribute('hidden',''); $open.style.display='none'; $open.setAttribute('aria-hidden','true'); }
    $hint && $hint.setAttribute('hidden','');
    $filled && $filled.removeAttribute('hidden');
    if ($intlOpen){ $intlOpen.hidden=true; $intlOpen.style.display='none'; }
    if ($editBtn) $editBtn.style.display='none';
    if ($changeCountry){ const e=intlEnabled(); $changeCountry.hidden=!e; $changeCountry.style.display=e?'inline-flex':'none'; }
    if ($cta) $cta.style.display='none';
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
    if (!seen.has('IN')) add('IN');
    POPULAR_CODES.forEach(add);
    Object.keys(COUNTRY_MAP).filter(c => !seen.has(c)).sort((a,b)=>COUNTRY_MAP[a].localeCompare(COUNTRY_MAP[b])).forEach(add);
  }

  function clearErr(){
    if (!$error) return;
    $error.hidden = true;
    try{ $error.textContent = $error.getAttribute('data-default') || $error.textContent; }catch(e){}
  }

  function showErr(msg){
    if (!$error) return;
    if (!$error.getAttribute('data-default')){ try{$error.setAttribute('data-default',$error.textContent||'');}catch(e){} }
    $error.textContent = msg || $error.textContent || 'Please enter a valid PIN.';
    $error.hidden = false;
  }

  let __heroMode = 'india';
  function setMode(mode){
    const intlOk = intlEnabled();
    const target = (mode==='intl' && intlOk) ? 'intl' : 'india';
    __heroMode = target;
    if ($countryWrap) $countryWrap.hidden = (target !== 'intl');
    if ($indiaWrap)   $indiaWrap.hidden   = (target !== 'india');
    if ($switchIntl)  $switchIntl.hidden  = !(intlOk && target==='india');
    if ($divider)     $divider.hidden     = true;
    clearErr();
    if (target==='intl'){ if($countrySelect) setTimeout(()=>{ try{$countrySelect.focus();}catch(e){} },0); }
    else{ if($pinInput) setTimeout(()=>{ try{$pinInput.focus();}catch(e){} },0); }
  }

  function openModal(focusTarget){
    if (!$modal) return;
    if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) $dialog&&$dialog.classList.add('is-drawer');
    else $dialog&&$dialog.classList.remove('is-drawer');
    const intlOk = intlEnabled();
    if (intlOk && $countrySelect){
      buildCountryOptions();
      const saved=loadIntlSelection();
      const code=saved&&saved.countryCode?String(saved.countryCode).toUpperCase():'';
      if (code && $countrySelect.querySelector(`option[value="${code}"]`)) $countrySelect.value=code;
      else if ($countrySelect.options.length){ const usOpt=$countrySelect.querySelector('option[value="US"]'); $countrySelect.value=usOpt?'US':$countrySelect.options[0].value; }
    }
    $modal.hidden = false;
    document.body.style.overflow = 'hidden';
    try{
      const c=window.LagETA&&typeof window.LagETA.getCookie==='function'?window.LagETA.getCookie():null;
      if ($pinInput) $pinInput.value=(c&&c.pin)?String(c.pin):'';
    }catch(e){}
    clearErr();
    const savedIntl = intlOk ? loadIntlSelection() : null;
    if (focusTarget==='country') setMode('intl');
    else if (focusTarget==='pin') setMode('india');
    else if (savedIntl&&savedIntl.countryCode) setMode('intl');
    else setMode('india');
  }

  function closeModal(){
    if ($modal) $modal.hidden = true;
    document.body.style.overflow = '';
    clearErr();
  }

  async function byPinSafe(pin){
    if (window.LagETA && typeof window.LagETA.byPin === 'function') return window.LagETA.byPin(pin);
    await new Promise((resolve)=>{
      let done=false;
      const t=setTimeout(()=>{if(done)return;done=true;resolve();},2500);
      window.addEventListener('lageta:ready',()=>{if(done)return;done=true;clearTimeout(t);resolve();},{once:true});
    });
    if (window.LagETA && typeof window.LagETA.byPin === 'function') return window.LagETA.byPin(pin);
    return null;
  }

  async function applyPin(){
    if (!$pinInput) return;
    clearErr();
    const p = normPin($pinInput.value);
    if (p.length !== 6){ showErr((window.LAG_ETA_TEXT&&window.LAG_ETA_TEXT.invalidPin)||'Not a valid pincode. Please enter a 6-digit PIN.'); return; }
    clearIntlSelection();
    let rec=null;
    try{ rec=await byPinSafe(p); }catch(e){}
    if (rec){ render(rec); closeModal(); }
    else{ showErr((window.LAG_ETA_TEXT&&window.LAG_ETA_TEXT.unserviceablePin)||"We couldn't find this pincode. Please enter a valid Indian PIN code."); }
  }

  function injectUseLocationButton(){
    if (!$modal || $useLocBtn) return;
    $useLocBtn = document.createElement('button');
    $useLocBtn.type = 'button';
    $useLocBtn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:none;border:1px solid currentColor;border-radius:8px;padding:7px 12px;font-size:13px;cursor:pointer;opacity:0.75;margin-top:10px;width:100%;justify-content:center';
    $useLocBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>Use current location';
    $useLocBtn.addEventListener('click', handleUseLocationClick);
    if ($indiaWrap) $indiaWrap.insertBefore($useLocBtn, $indiaWrap.firstChild);
  }

  async function handleUseLocationClick(){
    if (!$useLocBtn) return;
    const original = $useLocBtn.innerHTML;
    $useLocBtn.disabled = true;
    $useLocBtn.innerHTML = '<span style="opacity:.6">Detecting location...</span>';
    try{
      const pos = await getCurrentPosition({ enableHighAccuracy:false, timeout:10000, maximumAge:30000 });
      const { latitude: lat, longitude: lng } = pos.coords;
      const cached = readGeoCache(lat, lng);
      if (cached){
        if (cached.type === 'india' && cached.rec){ if($pinInput) $pinInput.value=String(cached.rec.pin||''); render(cached.rec); closeModal(); return; }
        if (cached.type === 'intl'  && cached.det){ setMode('intl'); buildCountryOptions(); if($countrySelect){ const opt=$countrySelect.querySelector('option[value="'+cached.det.countryCode+'"]'); if(opt) $countrySelect.value=cached.det.countryCode; } return; }
      }
      const geoResult = await reverseGeocode(lat, lng);
      if (!geoResult){ showErr('Could not detect location. Please enter manually.'); return; }
      const { pincode, countryCode, city, locality } = geoResult;
      if (countryCode === 'IN'){
        if (pincode && pincode.length === 6){
          if ($pinInput) $pinInput.value = pincode;
          clearErr();
          let rec = null;
          try{ rec = await byPinSafe(pincode); }catch(e){}
          if (rec){ if(!rec.city&&city) rec.city=city; if(!rec.locality&&locality) rec.locality=locality; writeGeoCache(lat,lng,{type:'india',rec}); render(rec); closeModal(); }
          else{ showErr('Pincode detected but not serviceable. Please enter manually.'); }
        } else{ showErr('Could not resolve pincode. Please enter manually.'); }
      } else if (countryCode && COUNTRY_MAP[countryCode]){
        writeGeoCache(lat, lng, { type:'intl', det:{ countryCode, countryName:COUNTRY_MAP[countryCode] }});
        setMode('intl'); buildCountryOptions();
        if ($countrySelect){ const opt=$countrySelect.querySelector('option[value="'+countryCode+'"]'); if(opt) $countrySelect.value=countryCode; }
      } else{ showErr('Country not supported. Please select manually.'); }
    }catch(e){ showErr('Location access denied. Please enter manually.'); }
    finally{ $useLocBtn.disabled=false; $useLocBtn.innerHTML=original; }
  }

  async function getPermissionState(){
    try{
      if (!navigator.permissions) return 'prompt';
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state;
    }catch(e){ return 'prompt'; }
  }

  async function applyGeoResult(lat, lng, geoResult){
    if (!geoResult) return;
    const { pincode, countryCode, city, locality } = geoResult;
    if (countryCode === 'IN'){
      if (!pincode || pincode.length !== 6) return;
      let rec = null;
      try{ rec = await byPinSafe(pincode); }catch(e){}
      if (rec){
        if (!rec.city && city) rec.city = city;
        if (!rec.locality && locality) rec.locality = locality;
        writeGeoCache(lat, lng, { type:'india', rec });
        render(rec);
      }
      return;
    }
    if (countryCode && COUNTRY_MAP[countryCode]){
      const det = { countryCode, countryName: COUNTRY_MAP[countryCode] };
      writeGeoCache(lat, lng, { type:'intl', det });
      saveIntlSelection(det);
      renderIntlLine(det);
    }
  }

  function waitForLagETA(){
    return new Promise((resolve) => {
      if (window.LagETA && window.LagETA.ready && window.LagETA.ready()){ resolve(); return; }
      window.addEventListener('lageta:ready', resolve, { once: true });
    });
  }

  async function startAutoDetect(){
    setTimeout(async () => {
      markPermissionAsked();
      if (!navigator.geolocation) return;
      await waitForLagETA();
      let pos;
      try{ pos = await getCurrentPosition(); }catch(e){ return; }
      const { latitude: lat, longitude: lng } = pos.coords;
      const cached = readGeoCache(lat, lng);
      if (cached){
        if (cached.type === 'india' && cached.rec) render(cached.rec);
        if (cached.type === 'intl'  && cached.det) renderIntlLine(cached.det);
        return;
      }
      try{
        const geoResult = await reverseGeocode(lat, lng);
        await applyGeoResult(lat, lng, geoResult);
      }catch(err){ console.error('[LagETA] Geocode failed:', err); }
    }, 150);
  }

  function bindEvents(){
    $open && $open.addEventListener('click', ()=>openModal());
    $editBtn && $editBtn.addEventListener('click', ()=>openModal());
    $applyBtn && $applyBtn.addEventListener('click', applyPin);
    $switchIntl && $switchIntl.addEventListener('click', ()=>setMode('intl'));
    $intlOpen && $intlOpen.addEventListener('click', ()=>openModal('country'));
    $changeCountry && $changeCountry.addEventListener('click', ()=>openModal('country'));
    $pinInput && $pinInput.addEventListener('keydown', function(e){ if(e.key==='Enter'){e.preventDefault();applyPin();} });

    $countryApply && $countryApply.addEventListener('click', function(){
      if (!$countrySelect) return;
      const code = String($countrySelect.value||'').toUpperCase();
      if (!code) return;
      clearErr();
      if (code==='IN'){ clearIntlSelection(); showEmpty(); setMode('india'); if($pinInput) setTimeout(()=>{try{$pinInput.focus();}catch(e){}},0); return; }
      const det={ countryCode:code, countryName:COUNTRY_MAP[code]||code };
      saveIntlSelection(det); renderIntlLine(det); closeModal();
    });

    $countryClear && $countryClear.addEventListener('click', function(){
      clearIntlSelection(); showEmpty(); setMode('india');
    });

    $closes && $closes.forEach(el => el.addEventListener('click', closeModal));

    document.addEventListener('keydown', function(e){
      if(e.key==='Escape'&&$modal&&!$modal.hidden) closeModal();
    },{ passive:true });

    if ($modal){
      new MutationObserver(async () => {
        if (!$modal.hidden && hasAskedPermission() && navigator.geolocation){
          const state = await getPermissionState();
          if (state === 'denied'){ if ($useLocBtn) $useLocBtn.style.display='none'; return; }
          injectUseLocationButton();
          if ($useLocBtn) $useLocBtn.style.display='inline-flex';
        }
      }).observe($modal, { attributes:true, attributeFilter:['hidden'] });
    }

    window.addEventListener(INTL_EVENT, function(ev){
      if (!intlEnabled()) return;
      const det=(ev&&ev.detail)||null;
      const code=det&&(det.countryCode||det.country)?String(det.countryCode||det.country).toUpperCase():'';
      if (code&&code!=='IN'){ renderIntlLine({countryCode:code,countryName:det.countryName||det.country||code}); return; }
      try{ const c=window.LagETA&&typeof window.LagETA.getCookie==='function'?window.LagETA.getCookie():null; if(c&&c.pin){render(c);return;} }catch(e){}
      showEmpty();
      if ($modal&&!$modal.hidden) setMode('india');
    },{ passive:true });

    window.addEventListener('lag:eta', function(ev){
      if (intlEnabled()){ const s=loadIntlSelection(); const code=s&&s.countryCode?String(s.countryCode).toUpperCase():''; if(code&&code!=='IN') return; }
      const detail=(ev&&ev.detail)||null;
      const rec=(detail&&(detail.result||detail))||null;
      if (rec&&rec.pin) render(rec);
    },{ passive:true });
  }

  function init(){
    if (intlEnabled()){
      const saved=loadIntlSelection();
      if (saved&&saved.countryCode&&saved.countryCode.toUpperCase()!=='IN'){ renderIntlLine(saved); return; }
    }
    try{ const c=window.LagETA&&typeof window.LagETA.getCookie==='function'?window.LagETA.getCookie():null; if(c&&c.pin){render(c);return;} }catch(e){}
    showEmpty();
  }

  function bootstrap(){
    initDOM();
    bindEvents();
    if (window.LagETA && window.LagETA.ready && window.LagETA.ready()) init();
    else window.addEventListener('lageta:ready', init, { once:true });
    startAutoDetect();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
</script>
