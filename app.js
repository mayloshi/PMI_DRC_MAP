(function () {
  const PROFILE_KEY = 'pmi-rdc-map-profiles-v2';
  const SAT_KEY = 'pmi-rdc-map-satisfaction-v1';
  const LOG_KEY = 'pmi-rdc-map-logs-v1';

  const continents = [
    'Afrique hors RDC',
    'Europe',
    'Amérique du Nord',
    'Amérique latine',
    'Asie',
    'Océanie'
  ];

  const continentGlobes = {
    'Afrique hors RDC': '🌍',
    Europe: '🌍',
    'Amérique du Nord': '🌎',
    'Amérique latine': '🌎',
    Asie: '🌏',
    'Océanie': '🌏'
  };

  const zoneAliases = {
    Amerique: 'Amérique',
    'Amerique du Nord': 'Amérique du Nord',
    'Amerique latine': 'Amérique latine',
    Oceanie: 'Océanie',
    Equateur: 'Équateur'
  };

  const provinceNameMap = {
    'Central Kasai': 'Kasai-Central',
    'Lower Uele': 'Bas-Uele',
    'North Kivu': 'Nord-Kivu',
    'South Kivu': 'Sud-Kivu',
    'Upper Uele': 'Haut-Uele',
    'Équateur': 'Équateur',
    'Ã‰quateur': 'Équateur'
  };

  const palette = [
    '#e8eef2', '#eef6f8', '#f4f0f7', '#f6efe9', '#e1edf0', '#f2f4f6',
    '#e6f3f5', '#f7f1ec', '#ece8f4', '#edf2f4', '#f5ede7', '#e7eff5'
  ];

  function provinces() {
    return (window.RDC_PROVINCES_GEOJSON.features || [])
      .map((feature, index) => ({
        name: provinceNameMap[feature.properties.shapeName] || feature.properties.shapeName,
        color: palette[index % palette.length],
        feature
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function supabaseConfig() {
    const appConfig = window.PMI_DRC_CONFIG || {};
    const staticConfig = appConfig.supabase || {};
    return {
      url: staticConfig.url || '',
      anonKey: staticConfig.anonKey || ''
    };
  }

  function dashboardPassword() {
    return (window.PMI_DRC_CONFIG && window.PMI_DRC_CONFIG.dashboardPassword) || '';
  }

  function isSupabaseConfigured() {
    const cfg = supabaseConfig();
    return Boolean(cfg.url && cfg.anonKey);
  }

  function supabaseUrl() {
    return supabaseConfig().url.replace(/\/$/, '');
  }

  function supabaseHeaders() {
    const cfg = supabaseConfig();
    return {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      'Content-Type': 'application/json'
    };
  }

  async function supabaseError(response, fallback) {
    let detail = '';
    try {
      detail = await response.text();
    } catch (error) {
      detail = '';
    }
    return `${fallback} Code ${response.status}.${detail ? ` Detail: ${detail}` : ''}`;
  }

  async function loadProfiles() {
    if (!isSupabaseConfigured()) return readJson(PROFILE_KEY, []);
    const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_profiles?select=*&order=updated_at.asc`, {
      headers: supabaseHeaders()
    });
    if (!response.ok) throw new Error(await supabaseError(response, 'Impossible de lire les profils Supabase.'));
    const rows = await response.json();
    const profiles = rows.map(rowToProfile);
    writeJson(PROFILE_KEY, profiles);
    return profiles;
  }

  async function saveProfiles(profiles) {
    if (!isSupabaseConfigured()) {
      writeJson(PROFILE_KEY, profiles);
      return;
    }
    for (const profile of profiles) {
      await upsertProfile(profile);
    }
    writeJson(PROFILE_KEY, profiles);
  }

  async function upsertProfile(profile) {
    const body = profileToRow(profile);
    const conflictKey = profile.email ? 'email' : 'pmi_id';
    const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_profiles?on_conflict=${conflictKey}`, {
      method: 'POST',
      headers: Object.assign({}, supabaseHeaders(), { Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await supabaseError(response, 'Supabase a refusé la mise à jour du profil.'));
  }

  async function deleteProfile(identityValue) {
    const profiles = (await loadProfiles()).filter(profile => profile.email !== identityValue && profile.pmiId !== identityValue);
    if (!isSupabaseConfigured()) {
      writeJson(PROFILE_KEY, profiles);
      return profiles;
    }
    const column = identityValue.includes('@') ? 'email' : 'pmi_id';
    const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_profiles?${column}=eq.${encodeURIComponent(identityValue)}`, {
      method: 'DELETE',
      headers: supabaseHeaders()
    });
    if (!response.ok) throw new Error(await supabaseError(response, 'La suppression Supabase a échoué.'));
    writeJson(PROFILE_KEY, profiles);
    return profiles;
  }

  async function resetAllData() {
    if (!isSupabaseConfigured()) {
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(SAT_KEY);
      return;
    }
    const headers = supabaseHeaders();
    const satisfactionResponse = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_satisfaction?id=not.is.null`, { method: 'DELETE', headers });
    if (!satisfactionResponse.ok) throw new Error(await supabaseError(satisfactionResponse, 'La suppression des satisfactions Supabase a échoué.'));
    const profileResponse = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_profiles?id=not.is.null`, { method: 'DELETE', headers });
    if (!profileResponse.ok) throw new Error(await supabaseError(profileResponse, 'La suppression des profils Supabase a échoué.'));
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(SAT_KEY);
  }

  async function resetSatisfactionData() {
    if (!isSupabaseConfigured()) {
      localStorage.removeItem(SAT_KEY);
      return;
    }
    const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_satisfaction?id=not.is.null`, {
      method: 'DELETE',
      headers: supabaseHeaders()
    });
    if (!response.ok) throw new Error(await supabaseError(response, 'La remise \u00e0 z\u00e9ro des satisfactions Supabase a \u00e9chou\u00e9.'));
    localStorage.removeItem(SAT_KEY);
  }

  async function loadSatisfaction() {
    if (!isSupabaseConfigured()) return readJson(SAT_KEY, []);
    const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_satisfaction?select=*&order=period.asc`, {
      headers: supabaseHeaders()
    });
    if (!response.ok) throw new Error(await supabaseError(response, 'Impossible de lire la satisfaction Supabase.'));
    const rows = await response.json();
    const items = rows.map(row => ({
      id: row.id,
      email: row.email,
      pmiId: row.pmi_id,
      period: row.period,
      rating: row.rating,
      comment: row.comment || '',
      createdAt: row.created_at
    }));
    writeJson(SAT_KEY, items);
    return items;
  }

  async function saveSatisfaction(item) {
    const row = {
      email: item.email || null,
      pmi_id: item.pmiId || null,
      period: item.period,
      rating: item.rating,
      comment: item.comment || ''
    };
    if (isSupabaseConfigured()) {
      const conflictKey = item.email ? 'email,period' : 'pmi_id,period';
      const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_satisfaction?on_conflict=${conflictKey}`, {
        method: 'POST',
        headers: Object.assign({}, supabaseHeaders(), { Prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify(row)
      });
      if (!response.ok) throw new Error(await supabaseError(response, 'Supabase a refusé la satisfaction.'));
    }
    const items = readJson(SAT_KEY, []);
    const index = items.findIndex(existing => sameSatisfactionIdentity(existing, item) && existing.period === item.period);
    if (index >= 0) items[index] = Object.assign({}, items[index], item);
    else items.push(item);
    writeJson(SAT_KEY, items);
  }

  async function deleteSatisfaction(item) {
    const items = (await loadSatisfaction()).filter(existing => !sameSatisfactionRecord(existing, item));
    if (!isSupabaseConfigured()) {
      writeJson(SAT_KEY, items);
      return items;
    }
    const target = satisfactionDeleteFilter(item);
    const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_satisfaction?${target}`, {
      method: 'DELETE',
      headers: supabaseHeaders()
    });
    if (!response.ok) throw new Error(await supabaseError(response, 'La suppression de la satisfaction Supabase a échoué.'));
    writeJson(SAT_KEY, items);
    return items;
  }

  function sameSatisfactionRecord(a, b) {
    if (a.id && b.id) return a.id === b.id;
    return sameSatisfactionIdentity(a, b) && a.period === b.period;
  }

  function satisfactionDeleteFilter(item) {
    if (item.id) return `id=eq.${encodeURIComponent(item.id)}`;
    const period = `period=eq.${encodeURIComponent(item.period)}`;
    const email = normalizeEmail(item.email);
    if (email) return `${period}&email=eq.${encodeURIComponent(email)}`;
    const pmiId = normalizePmiId(item.pmiId);
    if (pmiId) return `${period}&pmi_id=eq.${encodeURIComponent(pmiId)}`;
    throw new Error('Impossible de supprimer cette satisfaction : email et PMI ID absents.');
  }

  function sameSatisfactionIdentity(a, b) {
    const emailA = normalizeEmail(a.email);
    const emailB = normalizeEmail(b.email);
    const pmiA = normalizePmiId(a.pmiId);
    const pmiB = normalizePmiId(b.pmiId);
    if (emailA && emailB) return emailA === emailB;
    return Boolean(pmiA && pmiB && pmiA === pmiB);
  }

  async function loadLogs() {
    if (!isSupabaseConfigured()) return readJson(LOG_KEY, []);
    const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_logs?select=*&order=created_at.desc&limit=300`, {
      headers: supabaseHeaders()
    });
    if (!response.ok) {
      const cached = readJson(LOG_KEY, []);
      return cached.length ? cached : [];
    }
    const rows = await response.json();
    const logs = rows.map(row => ({
      id: row.id,
      timestamp: row.created_at,
      action: row.action,
      email: row.email || '',
      pmiId: row.pmi_id || '',
      details: row.details || '',
      browserLocation: row.browser_location || '',
      page: row.page || ''
    }));
    writeJson(LOG_KEY, logs);
    return logs;
  }

  async function logAction(action, options) {
    const opts = options || {};
    const item = {
      id: cryptoId(),
      timestamp: new Date().toISOString(),
      action,
      email: normalizeEmail(opts.email || ''),
      pmiId: normalizePmiId(opts.pmiId || ''),
      details: opts.details || '',
      browserLocation: await browserLocationText(),
      page: window.location.href
    };
    const logs = readJson(LOG_KEY, []);
    logs.unshift(item);
    writeJson(LOG_KEY, logs.slice(0, 500));
    if (!isSupabaseConfigured()) return;
    const row = {
      id: item.id,
      created_at: item.timestamp,
      action: item.action,
      email: item.email || null,
      pmi_id: item.pmiId || null,
      details: item.details,
      browser_location: item.browserLocation,
      page: item.page
    };
    const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_logs`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify(row)
    });
    if (!response.ok) return;
  }

  function browserLocationText() {
    if (!navigator.geolocation) return Promise.resolve('Geolocalisation navigateur non disponible');
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        position => {
          const coords = position.coords;
          resolve(`lat ${coords.latitude.toFixed(5)}, lon ${coords.longitude.toFixed(5)}, precision ${Math.round(coords.accuracy)} m`);
        },
        error => resolve(`Geolocalisation non disponible: ${error.message}`),
        { enableHighAccuracy: false, timeout: 2500, maximumAge: 300000 }
      );
    });
  }

  function profileToRow(profile) {
    return {
      email: profile.email || null,
      pmi_id: profile.pmiId || null,
      gender: profile.gender,
      occupation_status: profile.occupationStatus,
      member_active: Boolean(profile.roles.member.active),
      member_zone_name: profile.roles.member.zoneName || null,
      member_zone_type: profile.roles.member.zoneType || null,
      member_updated_at: profile.roles.member.updatedAt || null,
      volunteer_active: Boolean(profile.roles.volunteer.active),
      volunteer_zone_name: profile.roles.volunteer.zoneName || null,
      volunteer_zone_type: profile.roles.volunteer.zoneType || null,
      volunteer_updated_at: profile.roles.volunteer.updatedAt || null,
      updated_at: new Date().toISOString()
    };
  }

  function rowToProfile(row) {
    return {
      id: row.id,
      email: row.email,
      pmiId: row.pmi_id,
      gender: row.gender || '',
      occupationStatus: row.occupation_status || '',
      roles: {
        member: {
          active: Boolean(row.member_active),
          zoneName: row.member_zone_name || '',
          zoneType: row.member_zone_type || '',
          updatedAt: row.member_updated_at || ''
        },
        volunteer: {
          active: Boolean(row.volunteer_active),
          zoneName: row.volunteer_zone_name || '',
          zoneType: row.volunteer_zone_type || '',
          updatedAt: row.volunteer_updated_at || ''
        }
      }
    };
  }

  function blankProfile(identity) {
    return {
      id: cryptoId(),
      email: normalizeEmail(identity.email),
      pmiId: normalizePmiId(identity.pmiId),
      gender: identity.gender,
      occupationStatus: identity.occupationStatus,
      roles: {
        member: { active: false, zoneName: '', zoneType: '', updatedAt: '' },
        volunteer: { active: false, zoneName: '', zoneType: '', updatedAt: '' }
      }
    };
  }

  function selectedRoles(value) {
    if (value === 'member') return ['member'];
    if (value === 'volunteer') return ['volunteer'];
    if (value === 'both') return ['member', 'volunteer'];
    return [];
  }

  function roleLabel(role) {
    return role === 'member' ? 'membre' : 'volontaire';
  }

  function roleChoiceLabel(value) {
    if (value === 'member') return 'Membre';
    if (value === 'volunteer') return 'Volontaire';
    if (value === 'both') return 'Membre et volontaire';
    return 'Non renseigné';
  }

  function applyRoleOperation(profile, roleChoice, action, zoneName, zoneType) {
    const roles = selectedRoles(roleChoice);
    const now = new Date().toISOString();
    if (!roles.length) return { ok: false, message: 'Choisissez membre, volontaire ou les deux.' };

    if (action === 'cancel') {
      const active = roles.filter(role => profile.roles[role].active);
      if (!active.length) return { ok: false, message: 'Aucun r\u00f4le correspondant \u00e0 annuler pour ce profil.' };
      active.forEach(role => {
        profile.roles[role] = { active: false, zoneName: '', zoneType: '', updatedAt: now };
      });
      return { ok: true, message: `Annulation effectu\u00e9e pour ${active.map(roleLabel).join(' et ')}.` };
    }

    const hasMember = profile.roles.member.active;
    const hasVolunteer = profile.roles.volunteer.active;
    if (roleChoice === 'both' && (hasMember || hasVolunteer)) {
      const existing = hasMember && hasVolunteer ? 'membre et volontaire' : (hasMember ? 'membre' : 'volontaire');
      return { ok: false, message: `Vous \u00eates d\u00e9j\u00e0 enregistr\u00e9 comme ${existing}. Modifiez ou annulez un statut pr\u00e9cis au lieu de choisir Membre et volontaire.` };
    }

    roles.forEach(role => {
      profile.roles[role] = { active: true, zoneName, zoneType, updatedAt: now };
    });

    let message = `Localisation enregistr\u00e9e pour ${roles.map(roleLabel).join(' et ')}.`;
    const newSecondRole = roles.length === 1 && ((roles[0] === 'member' && hasVolunteer) || (roles[0] === 'volunteer' && hasMember));
    if (newSecondRole) {
      profile.roles.member.zoneName = zoneName;
      profile.roles.member.zoneType = zoneType;
      profile.roles.member.updatedAt = now;
      profile.roles.volunteer.zoneName = zoneName;
      profile.roles.volunteer.zoneType = zoneType;
      profile.roles.volunteer.updatedAt = now;
      message += ' La nouvelle province remplace aussi la province du r\u00f4le d\u00e9j\u00e0 actif.';
    }
    return { ok: true, message };
  }

  function buildStats(profiles) {
    const zones = {};
    provinces().forEach(province => {
      zones[province.name] = { type: 'province', members: 0, volunteers: 0, people: 0 };
    });
    continents.forEach(name => {
      zones[name] = { type: 'continent', members: 0, volunteers: 0, people: 0 };
    });

    profiles.forEach(profile => {
      const activeZones = new Set();
      const memberZone = normalizeZoneName(profile.roles.member.zoneName);
      const volunteerZone = normalizeZoneName(profile.roles.volunteer.zoneName);
      if (profile.roles.member.active && zones[memberZone]) {
        zones[memberZone].members += 1;
        activeZones.add(memberZone);
      }
      if (profile.roles.volunteer.active && zones[volunteerZone]) {
        zones[volunteerZone].volunteers += 1;
        activeZones.add(volunteerZone);
      }
      activeZones.forEach(zone => zones[zone].people += 1);
    });

    return zones;
  }

  function totals(stats) {
    return Object.values(stats).reduce((acc, item) => {
      acc.members += item.members;
      acc.volunteers += item.volunteers;
      acc.people += item.people;
      return acc;
    }, { members: 0, volunteers: 0, people: 0 });
  }

  function createSvgElement(name, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs).forEach(key => el.setAttribute(key, attrs[key]));
    return el;
  }

  function createProjection(geojson) {
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    geojson.features.forEach(feature => {
      eachCoordinate(feature.geometry, coord => {
        bounds[0] = Math.min(bounds[0], coord[0]);
        bounds[1] = Math.min(bounds[1], coord[1]);
        bounds[2] = Math.max(bounds[2], coord[0]);
        bounds[3] = Math.max(bounds[3], coord[1]);
      });
    });
    const mapBox = { x: 190, y: 30, width: 780, height: 760 };
    const scale = Math.min(mapBox.width / (bounds[2] - bounds[0]), mapBox.height / (bounds[3] - bounds[1]));
    const offsetX = mapBox.x + (mapBox.width - (bounds[2] - bounds[0]) * scale) / 2;
    const offsetY = mapBox.y + (mapBox.height - (bounds[3] - bounds[1]) * scale) / 2;
    return coord => [
      offsetX + (coord[0] - bounds[0]) * scale,
      offsetY + (bounds[3] - coord[1]) * scale
    ];
  }

  function featureToPath(feature, projection) {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    return polygons.map(polygon => polygon.map(ring => {
      return ring.map((coord, index) => {
        const point = projection(coord);
        return `${index === 0 ? 'M' : 'L'}${point[0].toFixed(2)},${point[1].toFixed(2)}`;
      }).join(' ') + ' Z';
    }).join(' ')).join(' ');
  }

  function featureCenter(feature, projection) {
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    eachCoordinate(feature.geometry, coord => {
      const point = projection(coord);
      bounds[0] = Math.min(bounds[0], point[0]);
      bounds[1] = Math.min(bounds[1], point[1]);
      bounds[2] = Math.max(bounds[2], point[0]);
      bounds[3] = Math.max(bounds[3], point[1]);
    });
    return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  }

  function featureBox(feature, projection) {
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    eachCoordinate(feature.geometry, coord => {
      const point = projection(coord);
      bounds[0] = Math.min(bounds[0], point[0]);
      bounds[1] = Math.min(bounds[1], point[1]);
      bounds[2] = Math.max(bounds[2], point[0]);
      bounds[3] = Math.max(bounds[3], point[1]);
    });
    return {
      x: bounds[0],
      y: bounds[1],
      width: bounds[2] - bounds[0],
      height: bounds[3] - bounds[1]
    };
  }

  function eachCoordinate(geometry, callback) {
    if (geometry.type === 'Polygon') geometry.coordinates.forEach(ring => ring.forEach(callback));
    if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(polygon => polygon.forEach(ring => ring.forEach(callback)));
  }

  function initMap(onZoneClick) {
    const root = document.getElementById('provinceMap');
    const labels = document.getElementById('provinceLabels');
    if (!root || !labels) return;
    const projection = createProjection(window.RDC_PROVINCES_GEOJSON);
    const items = provinces().map(province => {
      const center = featureCenter(province.feature, projection);
      const box = featureBox(province.feature, projection);
      const group = createSvgElement('g', { class: 'province' });
      const shape = createSvgElement('path', {
        d: featureToPath(province.feature, projection),
        fill: province.color,
        tabindex: '0',
        role: 'button',
        'aria-label': province.name,
        'data-province-shape': province.name
      });
      const title = createSvgElement('title', {});
      title.textContent = `${province.name} - Membres: 0 | Volontaires: 0`;
      shape.appendChild(title);
      shape.addEventListener('click', () => onZoneClick(province.name, 'Province'));
      shape.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onZoneClick(province.name, 'Province');
        }
      });
      group.appendChild(shape);
      root.appendChild(group);
      return { province, center, box };
    });
    drawLabels(items, labels);
    drawStatusBubbles(items);
  }

  function drawLabels(items, labelsRoot) {
    const outside = [];
    items.forEach(item => {
      if (canUseInsideLabel(item)) {
        drawInsideLabel(item, labelsRoot);
      } else {
        outside.push(item);
      }
    });
    const left = outside.filter(item => item.center[0] < 580).sort((a, b) => a.center[1] - b.center[1]);
    const right = outside.filter(item => item.center[0] >= 580).sort((a, b) => a.center[1] - b.center[1]);
    placeLabels(left, 16, labelsRoot);
    placeLabels(right, 1148, labelsRoot);
  }

  function canUseInsideLabel(item) {
    const name = shortName(item.province.name);
    const enoughWidth = item.box.width >= Math.max(86, name.length * 7.1);
    const enoughHeight = item.box.height >= 54;
    return enoughWidth && enoughHeight;
  }

  function drawInsideLabel(item, labelsRoot) {
    const group = createSvgElement('g', { class: 'inside-label', 'data-label': item.province.name });
    const name = createSvgElement('text', {
      x: item.center[0].toFixed(1),
      y: (item.center[1] - 6).toFixed(1),
      'text-anchor': 'middle'
    });
    name.textContent = shortName(item.province.name);
    const count = createSvgElement('text', {
      x: item.center[0].toFixed(1),
      y: (item.center[1] + 10).toFixed(1),
      class: 'count',
      'text-anchor': 'middle',
      'data-zone-count': item.province.name
    });
    count.textContent = 'M: 0 | V: 0';
    group.appendChild(name);
    group.appendChild(count);
    labelsRoot.appendChild(group);
  }

  function placeLabels(items, x, labelsRoot) {
    const step = Math.min(56, 730 / Math.max(items.length, 1));
    items.forEach((item, index) => {
      const y = 44 + index * step;
      const width = x < 580 ? 126 : 138;
      const anchorX = x < 580 ? x + width : x - width;
      const boxX = x < 580 ? x : x - width;
      const line = createSvgElement('path', {
        class: 'leader-line',
        d: `M${item.center[0].toFixed(1)},${item.center[1].toFixed(1)} L${anchorX},${y + 18}`
      });
      const group = createSvgElement('g', { class: 'map-label', 'data-label': item.province.name });
      const rect = createSvgElement('rect', { x: boxX, y, width, height: 38 });
      const name = createSvgElement('text', { x: boxX + 8, y: y + 15 });
      name.textContent = shortName(item.province.name);
      const count = createSvgElement('text', { x: boxX + 8, y: y + 30, class: 'count', 'data-zone-count': item.province.name });
      count.textContent = 'M: 0 | V: 0';
      group.appendChild(rect);
      group.appendChild(name);
      group.appendChild(count);
      group.addEventListener('click', () => document.querySelector(`[aria-label="${cssEscape(item.province.name)}"]`)?.dispatchEvent(new Event('click')));
      labelsRoot.appendChild(line);
      labelsRoot.appendChild(group);
    });
  }

  function drawStatusBubbles(items) {
    const root = document.getElementById('provinceBubbles');
    if (!root) return;
    root.innerHTML = '';
    items.forEach(item => {
      const offset = Math.min(8, Math.max(5, item.box.width / 9));
      const cy = Math.min(item.box.y + item.box.height - 15, item.center[1] + Math.min(20, item.box.height / 4));
      const member = createSvgElement('circle', {
        class: 'status-bubble member',
        cx: (item.center[0] - offset).toFixed(1),
        cy: cy.toFixed(1),
        r: 0,
        'data-member-bubble': item.province.name
      });
      const volunteer = createSvgElement('circle', {
        class: 'status-bubble volunteer',
        cx: (item.center[0] + offset).toFixed(1),
        cy: cy.toFixed(1),
        r: 0,
        'data-volunteer-bubble': item.province.name
      });
      root.appendChild(member);
      root.appendChild(volunteer);
    });
  }

  function shortName(name) {
    const map = {
      'Kasai-Central': 'Kasai-Central',
      'Kasai-Oriental': 'Kasai-Oriental',
      'Kongo-Central': 'Kongo-Central',
      'Haut-Katanga': 'Haut-Katanga',
      'Haut-Lomami': 'Haut-Lomami',
      'Haut-Uele': 'Haut-Uele',
      'Nord-Kivu': 'Nord-Kivu',
      'Sud-Kivu': 'Sud-Kivu',
      'Nord-Ubangi': 'Nord-Ubangi',
      'Sud-Ubangi': 'Sud-Ubangi'
    };
    return map[name] || name;
  }

  function initContinents(onZoneClick) {
    const root = document.getElementById('continentList');
    if (!root) return;
    root.innerHTML = `
      <svg viewBox="0 0 360 210" role="img" aria-label="Carte du monde cliquable hors RDC">
        <rect class="world-ocean" x="4" y="8" width="352" height="190" rx="14"></rect>
        <g class="world-zone" data-world-zone="Amérique du Nord" tabindex="0" role="button" aria-label="Amérique du Nord">
          <path class="world-continent" d="M42 61 C53 38 83 33 106 43 C128 34 149 47 146 70 C135 79 126 92 112 94 C101 105 83 95 70 101 C58 91 41 87 42 61 Z"></path>
          <text class="world-label" x="92" y="68">Amérique</text>
          <text class="world-label" x="92" y="82">du Nord</text>
          <text class="world-count" x="92" y="98" data-continent="Amérique du Nord">M: 0 | V: 0</text>
        </g>
        <g class="world-zone" data-world-zone="Amérique latine" tabindex="0" role="button" aria-label="Amérique latine">
          <path class="world-continent" d="M126 104 C144 112 151 128 145 146 C139 162 151 174 135 190 C124 179 122 164 111 153 C101 142 108 125 118 116 Z"></path>
          <text class="world-label" x="126" y="134">Amérique</text>
          <text class="world-label" x="126" y="148">latine</text>
          <text class="world-count" x="126" y="164" data-continent="Amérique latine">M: 0 | V: 0</text>
        </g>
        <g class="world-zone" data-world-zone="Europe" tabindex="0" role="button" aria-label="Europe">
          <path class="world-continent" d="M171 54 C186 39 216 43 222 61 C213 76 190 78 175 72 C164 69 162 61 171 54 Z"></path>
          <text class="world-label" x="195" y="62">Europe</text>
          <text class="world-count" x="195" y="78" data-continent="Europe">M: 0 | V: 0</text>
        </g>
        <g class="world-zone" data-world-zone="Afrique hors RDC" tabindex="0" role="button" aria-label="Afrique hors RDC">
          <path class="world-continent" d="M188 83 C212 74 233 88 236 113 C245 133 232 160 209 166 C189 152 174 127 178 104 C179 94 181 88 188 83 Z"></path>
          <text class="world-label" x="207" y="111">Afrique</text>
          <text class="world-label" x="207" y="125">hors RDC</text>
          <text class="world-count" x="207" y="142" data-continent="Afrique hors RDC">M: 0 | V: 0</text>
        </g>
        <g class="world-zone" data-world-zone="Asie" tabindex="0" role="button" aria-label="Asie">
          <path class="world-continent" d="M229 56 C259 34 316 44 329 73 C310 88 310 112 287 116 C267 107 244 116 230 98 C218 85 219 68 229 56 Z"></path>
          <text class="world-label" x="279" y="78">Asie</text>
          <text class="world-count" x="279" y="94" data-continent="Asie">M: 0 | V: 0</text>
        </g>
        <g class="world-zone" data-world-zone="Océanie" tabindex="0" role="button" aria-label="Océanie">
          <path class="world-continent" d="M282 147 C300 137 328 144 337 160 C321 174 292 171 280 160 Z"></path>
          <text class="world-label" x="310" y="156">Océanie</text>
          <text class="world-count" x="310" y="172" data-continent="Océanie">M: 0 | V: 0</text>
        </g>
      </svg>
    `;
    root.querySelectorAll('[data-world-zone]').forEach(zone => {
      const name = zone.dataset.worldZone;
      zone.addEventListener('click', () => onZoneClick(name, 'Continent'));
      zone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onZoneClick(name, 'Continent');
        }
      });
    });
  }

  function initZoneSelect() {
    const select = document.getElementById('zoneChoice');
    if (!select) return;
    const provinceGroup = document.createElement('optgroup');
    provinceGroup.label = 'Provinces RDC';
    provinces().forEach(province => {
      const option = document.createElement('option');
      option.value = `Province|${province.name}`;
      option.textContent = province.name;
      provinceGroup.appendChild(option);
    });
    const continentGroup = document.createElement('optgroup');
    continentGroup.label = 'Continents hors RDC';
    continents.forEach(name => {
      const option = document.createElement('option');
      option.value = `Continent|${name}`;
      option.textContent = name;
      continentGroup.appendChild(option);
    });
    select.appendChild(provinceGroup);
    select.appendChild(continentGroup);
  }

  async function refreshHome() {
    const profiles = await loadProfiles();
    const satisfaction = await loadSatisfaction();
    const stats = buildStats(profiles);
    renderCounts(stats);
    renderGlobalMood(satisfaction);
    drawHomeHistograms(stats, satisfaction);
  }

  function renderCounts(stats) {
    const total = totals(stats);
    const maxProvinceValue = Math.max(1, ...provinces().flatMap(province => {
      const item = stats[province.name] || { members: 0, volunteers: 0 };
      return [item.members, item.volunteers];
    }));
    setText('totalMembers', total.members);
    setText('totalVolunteers', total.volunteers);
    setText('totalUnique', total.people);
    Object.entries(stats).forEach(([name, item]) => {
      document.querySelectorAll(`[data-zone-count="${cssEscape(name)}"]`).forEach(el => {
        el.textContent = `M: ${item.members} | V: ${item.volunteers}`;
      });
      document.querySelectorAll(`[data-label="${cssEscape(name)}"]`).forEach(el => {
        el.classList.toggle('empty-zone', item.members + item.volunteers === 0);
      });
      document.querySelectorAll(`[data-province-shape="${cssEscape(name)}"] title`).forEach(el => {
        el.textContent = `${name} - Membres: ${item.members} | Volontaires: ${item.volunteers}`;
      });
      document.querySelectorAll(`[data-member-bubble="${cssEscape(name)}"]`).forEach(el => {
        el.setAttribute('r', bubbleRadius(item.members, maxProvinceValue));
      });
      document.querySelectorAll(`[data-volunteer-bubble="${cssEscape(name)}"]`).forEach(el => {
        el.setAttribute('r', bubbleRadius(item.volunteers, maxProvinceValue));
      });
      const continent = document.querySelector(`[data-continent="${cssEscape(name)}"]`);
      if (continent) continent.textContent = `M: ${item.members} | V: ${item.volunteers}`;
    });
  }

  function bubbleRadius(value, max) {
    if (!value) return 0;
    return (4 + Math.sqrt(value / max) * 7).toFixed(1);
  }

  function renderGlobalMood(items) {
    const month = currentPeriod();
    const year = month.slice(0, 4);
    const monthAvg = average(items.filter(item => item.period === month).map(item => item.rating));
    const yearAvg = average(items.filter(item => item.period && item.period.slice(0, 4) === year).map(item => item.rating));
    setText('monthMoodScore', `Mois ${monthAvg.toFixed(1)}/5`);
    setText('monthMoodEmoji', moodEmoji(monthAvg));
    setText('yearMoodScore', `Année ${yearAvg.toFixed(1)}/5`);
    setText('yearMoodEmoji', moodEmoji(yearAvg));
  }

  function drawHomeHistograms(stats, satisfaction) {
    drawSingleProvinceHistogram('homeMembersChart', stats, 'members', 'Membres par province', '#4f17a8');
    drawSingleProvinceHistogram('homeVolunteersChart', stats, 'volunteers', 'Volontaires par province', '#00b5d1');
    drawStarsHistogram('homeStarsChart', satisfaction);
  }

  function drawSingleProvinceHistogram(id, stats, field, title, color) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    clearCanvas(ctx, canvas);
    const entries = provinces()
      .map(province => [province.name, (stats[province.name] && stats[province.name][field]) || 0])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const max = Math.max(1, ...entries.map(([, value]) => value));
    const padLeft = 46;
    const chartTop = 54;
    const chartBottom = 305;
    const barGap = 5;
    const barW = Math.max(12, (canvas.width - padLeft * 2) / entries.length - barGap);
    ctx.fillStyle = '#1b1f2a';
    ctx.font = '20px Aptos, Calibri, Tahoma, Arial';
    ctx.fillText(title, padLeft, 30);
    ctx.strokeStyle = '#d9deea';
    ctx.beginPath();
    ctx.moveTo(padLeft, chartBottom);
    ctx.lineTo(canvas.width - padLeft, chartBottom);
    ctx.stroke();
    entries.forEach(([name, value], index) => {
      const x = padLeft + index * (barW + barGap);
      const height = value / max * (chartBottom - chartTop);
      ctx.fillStyle = color;
      ctx.fillRect(x, chartBottom - height, barW, height);
      ctx.fillStyle = '#1b1f2a';
      ctx.font = '12px Aptos, Calibri, Tahoma, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(String(value), x + barW / 2, chartBottom - height - 6);
      ctx.save();
      ctx.translate(x + barW / 2, chartBottom + 18);
      ctx.rotate(-Math.PI / 3);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#344054';
      ctx.font = '11px Aptos, Calibri, Tahoma, Arial';
      ctx.fillText(name, 0, 0);
      ctx.restore();
    });
    ctx.textAlign = 'left';
  }

  function drawStarsHistogram(id, satisfaction) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    clearCanvas(ctx, canvas);
    const counts = yearlyRoundedRatingCounts(satisfaction);
    const max = Math.max(1, ...counts.slice(1));
    const left = 70;
    const bottom = 250;
    const top = 58;
    const step = 140;
    const barW = 70;
    ctx.fillStyle = '#1b1f2a';
    ctx.font = '20px Aptos, Calibri, Tahoma, Arial';
    ctx.fillText("Votes par nombre d'étoiles - moyenne annuelle arrondie par votant", left, 30);
    ctx.strokeStyle = '#d9deea';
    ctx.beginPath();
    ctx.moveTo(left - 20, bottom);
    ctx.lineTo(left + step * 4 + 90, bottom);
    ctx.stroke();
    for (let rating = 1; rating <= 5; rating += 1) {
      const value = counts[rating];
      const x = left + (rating - 1) * step;
      const height = value / max * (bottom - top);
      ctx.fillStyle = '#ffb000';
      ctx.fillRect(x, bottom - height, barW, height);
      ctx.fillStyle = '#1b1f2a';
      ctx.font = '16px Aptos, Calibri, Tahoma, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(String(value), x + barW / 2, bottom - height - 8);
      ctx.font = '15px Aptos, Calibri, Tahoma, Arial';
      ctx.fillText(`${rating} étoile${rating > 1 ? 's' : ''}`, x + barW / 2, bottom + 28);
    }
    ctx.textAlign = 'left';
  }

  function yearlyRoundedRatingCounts(items) {
    const year = currentPeriod().slice(0, 4);
    const byVoter = {};
    items
      .filter(item => item.period && item.period.slice(0, 4) === year)
      .forEach(item => {
        const key = normalizeEmail(item.email) || normalizePmiId(item.pmiId);
        if (!key) return;
        if (!byVoter[key]) byVoter[key] = [];
        byVoter[key].push(Number(item.rating));
      });
    const counts = [0, 0, 0, 0, 0, 0];
    Object.values(byVoter).forEach(values => {
      const rounded = Math.max(1, Math.min(5, Math.round(average(values))));
      counts[rounded] += 1;
    });
    return counts;
  }

  function readIdentity(options) {
    const opts = options || {};
    const identity = {
      email: document.getElementById('email').value,
      pmiId: document.getElementById('pmiId').value,
      gender: checkedValue('gender'),
      occupationStatus: checkedValue('occupationStatus')
    };
    if (!identity.email && !identity.pmiId) {
      throw new Error('Renseignez au moins email ou PMI ID.');
    }
    if (opts.requireProfileFields !== false && (!identity.gender || !identity.occupationStatus)) {
      throw new Error('Complétez le sexe et le statut.');
    }
    if (identity.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)) throw new Error('Email invalide.');
    return identity;
  }

  function readIdentityForLookup() {
    return readIdentity({ requireProfileFields: false });
  }

  function findProfileByIdentity(profiles, identity) {
    const email = normalizeEmail(identity.email);
    const pmiId = normalizePmiId(identity.pmiId);
    return profiles.find(item => (email && item.email === email) || (pmiId && item.pmiId === pmiId));
  }

  function assertIdentityMatchesProfile(profile, identity) {
    const email = normalizeEmail(identity.email);
    const pmiId = normalizePmiId(identity.pmiId);
    if (profile && email && profile.email && profile.email !== email) throw new Error('Ce PMI ID est déjà associé à un autre email.');
    if (profile && pmiId && profile.pmiId && profile.pmiId !== pmiId) throw new Error('Cet email est déjà associé à un autre PMI ID.');
  }

  function mergeIdentityIntoProfile(profile, identity) {
    const email = normalizeEmail(identity.email);
    const pmiId = normalizePmiId(identity.pmiId);
    if (email && !profile.email) profile.email = email;
    if (pmiId && !profile.pmiId) profile.pmiId = pmiId;
  }

  async function existingProfileForForm() {
    const identity = readIdentityForLookup();
    const profiles = await loadProfiles();
    const profile = findProfileByIdentity(profiles, identity);
    if (profile) assertIdentityMatchesProfile(profile, identity);
    return profile || null;
  }

  async function updateExistingActionState() {
    const updateButton = document.getElementById('updateProfileInfo');
    const cancelButton = document.getElementById('applyCancel');
    const actionSelect = document.getElementById('roleAction');
    if (!updateButton || !cancelButton || !actionSelect) return;
    updateButton.disabled = true;
    cancelButton.disabled = true;
    actionSelect.disabled = true;
    try {
      const profile = await existingProfileForForm();
      const enabled = Boolean(profile);
      updateButton.disabled = !enabled;
      cancelButton.disabled = !enabled;
      actionSelect.disabled = !enabled;
      if (!enabled) actionSelect.value = 'add';
    } catch (error) {
      actionSelect.value = 'add';
    }
  }

  async function handleZone(zoneName, zoneType) {
    setText('selectedZone', `Zone sélectionnée : ${zoneName}`);
    setStatus('Enregistrement en cours...', '');
    setBusy(true, 'Enregistrement en cours...');
    try {
      const identity = readIdentity();
      const roleChoice = document.getElementById('roleChoice').value;
      const action = document.getElementById('roleAction').value;
      if (action === 'cancel') {
        throw new Error("Pour annuler, utilisez le bouton Appliquer une annulation. Aucun nouveau clic sur la carte n'est nécessaire.");
      }
      const profiles = await loadProfiles();
      let profile = findProfileByIdentity(profiles, identity);
      assertIdentityMatchesProfile(profile, identity);
      if (!profile) {
        profile = blankProfile(identity);
        profiles.push(profile);
      }
      mergeIdentityIntoProfile(profile, identity);
      profile.gender = identity.gender;
      profile.occupationStatus = identity.occupationStatus;
      const result = applyRoleOperation(profile, roleChoice, action, zoneName, zoneType);
      if (!result.ok) throw new Error(result.message);
      await saveProfiles(profiles);
      await logAction('localisation', {
        email: profile.email,
        pmiId: profile.pmiId,
        details: `${result.message} Zone: ${zoneName} (${zoneType}). Choix: ${roleChoice}.`
      });
      await refreshHome();
      await updateExistingActionState();
      setStatus(result.message, 'success');
      showToast('Localisation enregistrée', [
        `Email : ${profile.email || 'non renseigné'}`,
        `PMI ID : ${profile.pmiId || 'non renseigné'}`,
        `Statut PMI : ${roleChoiceLabel(roleChoice)}`,
        `${zoneType} : ${zoneName}`
      ]);
      closeRegistrationModal();
    } catch (error) {
      setStatus(error.message, 'error');
      openRegistrationModal();
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setStatus('Enregistrement en cours...', '');
    setBusy(true, 'Enregistrement en cours...');
    try {
      const identity = readIdentityForLookup();
      const roleChoice = document.getElementById('roleChoice').value;
      const profiles = await loadProfiles();
      const identityValue = normalizeEmail(identity.email) || normalizePmiId(identity.pmiId);
      const profile = findProfileByIdentity(profiles, identity);
      if (!profile) throw new Error('Aucune localisation trouvée pour cet email ou ce PMI ID.');
      assertIdentityMatchesProfile(profile, identity);
      mergeIdentityIntoProfile(profile, identity);
      const result = applyRoleOperation(profile, roleChoice, 'cancel', '', '');
      if (!result.ok) throw new Error(result.message);
      const hasActiveRole = profile.roles.member.active || profile.roles.volunteer.active;
      if (!hasActiveRole) {
        const confirmed = confirm("Cette personne n'a plus aucun statut actif. Voulez-vous supprimer son entrée de la base de données ?");
        if (!confirmed) {
          setStatus("Annulation interrompue : l'entrée n'a pas été supprimée.", 'error');
          return;
        }
        await deleteProfile(identityValue);
        await logAction('suppression après annulation', {
          email: profile.email,
          pmiId: profile.pmiId,
          details: `${result.message} Aucun statut actif restant. Entrée supprimée.`
        });
      } else {
        await saveProfiles(profiles);
        await logAction('annulation', {
          email: profile.email,
          pmiId: profile.pmiId,
          details: `${result.message} Choix: ${roleChoice}.`
        });
      }
      await refreshHome();
      await updateExistingActionState();
      setStatus(hasActiveRole ? result.message : "Annulation effectuée et entrée supprimée de la base de données.", 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function updateProfileInfo() {
    setStatus('Enregistrement en cours...', '');
    setBusy(true, 'Enregistrement en cours...');
    try {
      const identity = readIdentity();
      const profiles = await loadProfiles();
      const profile = findProfileByIdentity(profiles, identity);
      if (!profile) throw new Error('Aucun profil trouvé pour cet email ou ce PMI ID.');
      assertIdentityMatchesProfile(profile, identity);
      mergeIdentityIntoProfile(profile, identity);
      profile.gender = identity.gender;
      profile.occupationStatus = identity.occupationStatus;
      await saveProfiles(profiles);
      await logAction('mise à jour profil', {
        email: profile.email,
        pmiId: profile.pmiId,
        details: `Sexe: ${profile.gender}. Statut: ${profile.occupationStatus}.`
      });
      await refreshHome();
      await updateExistingActionState();
      setStatus('Sexe/statut mis à jour.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function existingSatisfaction(items, identity, period) {
    const probe = {
      email: normalizeEmail(identity.email),
      pmiId: normalizePmiId(identity.pmiId),
      period
    };
    return items.find(item => sameSatisfactionIdentity(item, probe) && item.period === period) || null;
  }

  function scheduleExistingActionState() {
    clearTimeout(window.pmiActionStateTimer);
    window.pmiActionStateTimer = setTimeout(() => {
      updateExistingActionState().catch(() => {});
    }, 250);
  }

  function setupStars() {
    let rating = 0;
    const buttons = Array.from(document.querySelectorAll('#stars button'));
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        rating = Number(button.dataset.rating);
        buttons.forEach(item => {
          const active = Number(item.dataset.rating) <= rating;
          item.classList.toggle('active', active);
          item.textContent = active ? '\u2605' : '\u2606';
        });
      });
    });
    return () => rating;
  }

  function initRegistrationModal() {
    const open = document.getElementById('openRegistration');
    const close = document.getElementById('closeRegistration');
    const modal = document.getElementById('registrationModal');
    if (!open || !close || !modal) return;
    open.addEventListener('click', openRegistrationModal);
    close.addEventListener('click', closeRegistrationModal);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeRegistrationModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.hidden) closeRegistrationModal();
    });
  }

  function openRegistrationModal() {
    const modal = document.getElementById('registrationModal');
    if (!modal) return;
    modal.hidden = false;
    setTimeout(() => document.getElementById('email')?.focus(), 0);
  }

  function closeRegistrationModal() {
    const modal = document.getElementById('registrationModal');
    if (modal) modal.hidden = true;
  }

  function initEntryMode() {
    const zone = document.getElementById('formModeZone');
    const interactiveButton = document.getElementById('useInteractiveMap');
    if (!zone) return;
    const sync = () => {
      const mode = checkedValue('entryMode');
      zone.hidden = mode !== 'form';
      if (interactiveButton) interactiveButton.hidden = mode !== 'interactive';
      const note = mode === 'form'
        ? 'Mode formulaire : choisissez une province ou un continent dans la liste, puis enregistrez.'
        : 'Mode interactif : cliquez directement sur une province ou un continent.';
      setText('selectedZone', note);
    };
    document.querySelectorAll('input[name="entryMode"]').forEach(input => {
      input.addEventListener('change', sync);
    });
    if (interactiveButton) interactiveButton.addEventListener('click', closeRegistrationModal);
    sync();
  }

  async function initHome() {
    const month = document.getElementById('surveyMonth');
    if (month) month.value = currentPeriod();
    initMap(handleZone);
    initContinents(handleZone);
    initZoneSelect();
    initRegistrationModal();
    initEntryMode();
    const getRating = setupStars();
    document.getElementById('saveSurvey').addEventListener('click', async () => {
      setStatus('Enregistrement en cours...', '');
      setBusy(true, 'Enregistrement en cours...');
      try {
        const identity = readIdentity();
        const rating = getRating();
        if (!rating) throw new Error('Choisissez une note de satisfaction de 1 \u00e0 5.');
        const period = currentPeriod();
        const previous = existingSatisfaction(await loadSatisfaction(), identity, period);
        await saveSatisfaction({
          id: cryptoId(),
          email: normalizeEmail(identity.email),
          pmiId: normalizePmiId(identity.pmiId),
          period,
          rating,
          comment: document.getElementById('comment').value.trim(),
          createdAt: new Date().toISOString()
        });
        await logAction('satisfaction', {
          email: identity.email,
          pmiId: identity.pmiId,
          details: `Période: ${period}. Note: ${rating}/5.`
        });
        await refreshHome();
        setStatus(previous ? 'Votre enquête de satisfaction précédente pour ce mois a été remplacée.' : 'Satisfaction mensuelle enregistrée.', 'success');
        showToast('Satisfaction enregistrée', [
          `Vote : ${rating}/5 étoile${rating > 1 ? 's' : ''}`
        ]);
      } catch (error) {
        setStatus(error.message, 'error');
        openRegistrationModal();
      } finally {
        setBusy(false);
      }
    });
    document.getElementById('saveZoneChoice').addEventListener('click', async () => {
      const value = document.getElementById('zoneChoice').value;
      if (!value) {
        setStatus('Choisissez une province ou un continent.', 'error');
        return;
      }
      const [zoneType, zoneName] = value.split('|');
      await handleZone(zoneName, zoneType);
    });
    document.getElementById('applyCancel').addEventListener('click', handleCancel);
    document.getElementById('updateProfileInfo').addEventListener('click', updateProfileInfo);
    document.getElementById('email').addEventListener('input', scheduleExistingActionState);
    document.getElementById('pmiId').addEventListener('input', scheduleExistingActionState);
    setStatus('Chargement en cours...', '');
    setBusy(true, 'Chargement en cours...');
    try {
      await refreshHome();
      await updateExistingActionState();
      setStatus('Les compteurs se mettent à jour après chaque opération valide.', '');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
    if (!window.pmiHomeRefreshTimer) {
      window.pmiHomeRefreshTimer = setInterval(() => refreshHome().catch(error => setStatus(error.message, 'error')), 30000);
    }
  }

  async function initDashboard() {
    const password = document.getElementById('dashboardPassword');
    const unlock = document.getElementById('unlockDashboard');
    unlock.addEventListener('click', async () => {
      if (password.value !== dashboardPassword()) {
        setDashboardStatus('Mot de passe incorrect.', 'error');
        return;
      }
      setDashboardStatus('', '');
      await logAction('dashboard acces', { details: 'Mot de passe valide.' });
      document.getElementById('passwordPanel').hidden = true;
      document.getElementById('dashboardContent').hidden = false;
      await loadDbConfigFields();
      bindDashboardActions();
      await refreshDashboard();
      if (!window.pmiDashboardRefreshTimer) {
        window.pmiDashboardRefreshTimer = setInterval(() => refreshDashboard().catch(error => setDashboardStatus(error.message, 'error')), 30000);
      }
    });
    password.addEventListener('keydown', event => {
      if (event.key === 'Enter') unlock.click();
    });
  }

  function bindDashboardActions() {
    if (window.dashboardActionsBound) return;
    window.dashboardActionsBound = true;
    document.getElementById('refreshDashboard').addEventListener('click', refreshDashboard);
    document.getElementById('nikoPeriod').addEventListener('change', refreshDashboard);
    document.getElementById('exportCsv').addEventListener('click', async () => {
      await logAction('export csv', { details: 'Export dashboard CSV.' });
      await exportCsv();
    });
    document.getElementById('exportPng').addEventListener('click', async () => {
      await logAction('export png', { details: 'Export histogramme PNG.' });
      exportPng();
    });
    document.getElementById('downloadConfig').addEventListener('click', downloadSupabaseConfig);
    document.getElementById('supabaseUrl').addEventListener('input', refreshConfigPreview);
    document.getElementById('supabaseAnon').addEventListener('input', refreshConfigPreview);
    document.getElementById('refreshLogs').addEventListener('click', renderLogs);
    document.getElementById('resetSatisfaction').addEventListener('click', async () => {
      if (!confirm('Effacer toutes les satisfactions uniquement ?')) return;
      await resetSatisfactionData();
      await logAction('remise \u00e0 z\u00e9ro satisfactions', { details: 'Toutes les satisfactions ont \u00e9t\u00e9 effac\u00e9es.' });
      await refreshDashboard();
      setDashboardStatus('Satisfactions remises \u00e0 z\u00e9ro.', 'success');
    });
    document.getElementById('resetAll').addEventListener('click', async () => {
      if (!confirm('Effacer tous les profils et toutes les satisfactions ?')) return;
      await resetAllData();
      await logAction('remise \u00e0 z\u00e9ro g\u00e9n\u00e9rale', { details: 'Profils et satisfactions effac\u00e9s. Logs conserv\u00e9s.' });
      await refreshDashboard();
      setDashboardStatus('Donn\u00e9es effac\u00e9es.', 'success');
    });
  }

  async function loadDbConfigFields() {
    const cfg = supabaseConfig();
    document.getElementById('supabaseUrl').value = cfg.url;
    document.getElementById('supabaseAnon').value = cfg.anonKey;
    await loadConfigFilePreview();
    await updateDbConnectionStatus();
  }

  function refreshConfigPreview() {
    const box = document.getElementById('configPreview');
    if (!box) return;
    box.value = configFileContent(
      document.getElementById('supabaseUrl').value.trim(),
      document.getElementById('supabaseAnon').value.trim()
    );
  }

  async function loadConfigFilePreview() {
    const box = document.getElementById('configPreview');
    if (!box) return;
    try {
      const response = await fetch(`supabase-config.js?read=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Code ${response.status}`);
      box.value = await response.text();
    } catch (error) {
      refreshConfigPreview();
    }
  }

  async function updateDbConnectionStatus() {
    const box = document.getElementById('dbConnectionStatus');
    if (!box) return;
    if (!isSupabaseConfigured()) {
      box.className = 'status error';
      box.textContent = 'Base non configurée : les données restent dans ce navigateur et ne sont pas partagées.';
      return;
    }
    try {
      const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_satisfaction?select=id&limit=1`, {
        headers: supabaseHeaders(),
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(await supabaseError(response, 'Lecture test Supabase impossible.'));
      box.className = 'status success';
      box.textContent = 'Base configurée : la page lit et écrit dans Supabase.';
    } catch (error) {
      box.className = 'status error';
      box.textContent = error.message;
    }
  }

  function downloadSupabaseConfig() {
    const url = document.getElementById('supabaseUrl').value.trim();
    const anonKey = document.getElementById('supabaseAnon').value.trim();
    if (!window.PMI_DRC_CONFIG) window.PMI_DRC_CONFIG = {};
    window.PMI_DRC_CONFIG.supabase = { url, anonKey };
    refreshConfigPreview();
    updateDbConnectionStatus();
    downloadText(configFileContent(url, anonKey), 'supabase-config.js', 'application/javascript;charset=utf-8');
    logAction('configuration supabase', { details: `Fichier config généré. URL: ${url || 'vide'}.` }).catch(() => {});
    setDashboardStatus('Fichier supabase-config.js généré. Publiez ce fichier pour appliquer la configuration à tous les navigateurs.', 'success');
  }

  function configFileContent(url, anonKey) {
    return `window.PMI_DRC_CONFIG = {\n  dashboardPassword: ${JSON.stringify(dashboardPassword())},\n  supabase: {\n    url: ${JSON.stringify(url)},\n    anonKey: ${JSON.stringify(anonKey)}\n  }\n};\n`;
  }

  async function refreshDashboard() {
    try {
      const profiles = await loadProfiles();
      const satisfaction = await loadSatisfaction();
      const stats = buildStats(profiles);
      const total = totals(stats);
      const satAvg = average(satisfaction.map(item => item.rating));
      setText('kpiMembers', total.members);
      setText('kpiVolunteers', total.volunteers);
      setText('kpiPeople', total.people);
      setText('kpiSatisfaction', satAvg.toFixed(1));
      setText('dashboardEmoji', moodEmoji(satAvg));
      drawProvinceChart('provinceChart', stats);
      drawPieChart('genderChart', countBy(profiles, 'gender'), 'Sexe');
      drawPieChart('occupationChart', countBy(profiles, 'occupationStatus'), 'Étudiant / Professionnel');
      renderNiko(satisfaction);
      renderProfiles(profiles);
      await renderLogs();
    } catch (error) {
      setDashboardStatus(error.message, 'error');
    }
  }

  function drawProvinceChart(id, stats) {
    const canvas = document.getElementById(id);
    const ctx = canvas.getContext('2d');
    clearCanvas(ctx, canvas);
    const entries = provinces().map(province => [province.name, stats[province.name] || { members: 0, volunteers: 0 }]);
    const max = Math.max(1, ...entries.map(([, item]) => Math.max(item.members, item.volunteers)));
    const pad = 42;
    const chartTop = 66;
    const chartBottom = canvas.height - 76;
    const labelY = canvas.height - 34;
    const barW = Math.max(10, (canvas.width - pad * 2) / entries.length - 4);
    ctx.fillStyle = '#1b1f2a';
    ctx.font = '18px Aptos, Calibri, Tahoma, Arial';
    ctx.fillText('Membres et volontaires par province', pad, 28);
    entries.forEach(([name, item], index) => {
      const x = pad + index * (barW + 4);
      const memberH = item.members / max * (chartBottom - chartTop);
      const volunteerH = item.volunteers / max * (chartBottom - chartTop);
      ctx.fillStyle = '#4f17a8';
      ctx.fillRect(x, chartBottom - memberH, barW / 2, memberH);
      ctx.fillStyle = '#00b5d1';
      ctx.fillRect(x + barW / 2, chartBottom - volunteerH, barW / 2, volunteerH);
      ctx.save();
      ctx.translate(x + 2, labelY);
      ctx.rotate(-Math.PI / 3);
      ctx.fillStyle = '#344054';
      ctx.font = '10px Aptos, Calibri, Tahoma, Arial';
      ctx.fillText(name, 0, 0);
      ctx.restore();
    });
    ctx.fillStyle = '#4f17a8';
    ctx.fillRect(pad, 45, 14, 14);
    ctx.fillStyle = '#1b1f2a';
    ctx.font = '13px Aptos, Calibri, Tahoma, Arial';
    ctx.fillText('Membres', pad + 20, 57);
    ctx.fillStyle = '#00b5d1';
    ctx.fillRect(pad + 100, 45, 14, 14);
    ctx.fillStyle = '#1b1f2a';
    ctx.fillText('Volontaires', pad + 120, 57);
  }

  function drawPieChart(id, counts, title) {
    const canvas = document.getElementById(id);
    const ctx = canvas.getContext('2d');
    clearCanvas(ctx, canvas);
    const entries = Object.entries(counts).filter(([, value]) => value > 0);
    const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
    let start = -Math.PI / 2;
    const colors = ['#4f17a8', '#00b5d1', '#ff671f', '#86bc86', '#d4a6c8'];
    const radius = Math.min(canvas.width, canvas.height) * 0.28;
    const centerX = Math.min(112, canvas.width * 0.32);
    const centerY = canvas.height * 0.54;
    const legendX = Math.min(canvas.width - 125, centerX + radius + 34);
    ctx.fillStyle = '#1b1f2a';
    ctx.font = '16px Aptos, Calibri, Tahoma, Arial';
    ctx.fillText(title, 18, 26);
    entries.forEach(([label, value], index) => {
      const angle = value / total * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = colors[index % colors.length];
      ctx.fill();
      start += angle;
      ctx.fillRect(legendX, 58 + index * 26, 13, 13);
      ctx.fillStyle = '#1b1f2a';
      ctx.font = '12px Aptos, Calibri, Tahoma, Arial';
      ctx.fillText(`${label}: ${value}`, legendX + 20, 69 + index * 26);
    });
  }

  function clearCanvas(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function renderNiko(items) {
    const period = document.getElementById('nikoPeriod').value;
    const body = document.getElementById('nikoBody');
    body.innerHTML = '';
    const rows = items
      .slice()
      .sort((a, b) => String(b.period || '').localeCompare(String(a.period || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    window.pmiNikoRows = rows;
    rows.forEach((item, index) => {
      const key = periodKey(item.period, period);
      const tr = document.createElement('tr');
      const email = normalizeEmail(item.email);
      const pmiId = normalizePmiId(item.pmiId);
      const contact = email
        ? `<a class="button email-action" href="${mailtoHref(item)}">Répondre par email</a>`
        : '<span class="email-action disabled">Email absent</span>';
      tr.innerHTML = `
        <td>${escapeHtml(key)}<br><span class="mini-count">${escapeHtml(item.period || '')}</span></td>
        <td>${escapeHtml(email || '')}</td>
        <td>${escapeHtml(pmiId || '')}</td>
        <td>${escapeHtml(item.rating)}/5</td>
        <td>${moodEmoji(Number(item.rating))}</td>
        <td>${escapeHtml(item.comment || 'Aucun commentaire')}</td>
        <td>${contact}</td>
        <td><button class="delete-click" type="button" data-delete-satisfaction="${index}">❌ Supprimer</button></td>
      `;
      body.appendChild(tr);
    });
    body.querySelectorAll('[data-delete-satisfaction]').forEach(button => {
      button.addEventListener('click', async () => {
        const item = window.pmiNikoRows[Number(button.dataset.deleteSatisfaction)];
        if (!item) return;
        const label = item.email || item.pmiId || 'cette personne';
        if (!confirm(`Supprimer la satisfaction de ${label} pour ${item.period} ?`)) return;
        await deleteSatisfaction(item);
        await logAction('suppression satisfaction', {
          email: item.email,
          pmiId: item.pmiId,
          details: `Satisfaction supprimée. Période: ${item.period}. Note: ${item.rating}/5.`
        });
        await refreshDashboard();
        setDashboardStatus('Satisfaction supprimée.', 'success');
      });
    });
    if (!body.children.length) body.innerHTML = '<tr><td colspan="8">Aucune satisfaction enregistrée.</td></tr>';
  }

  function mailtoHref(item) {
    const email = normalizeEmail(item.email);
    const subject = `Enquête de satisfaction PMI RDC - ${item.period || ''}`;
    const body = [
      'Bonjour,',
      '',
      `Merci pour votre retour de satisfaction (${item.rating}/5).`,
      item.comment ? `Votre commentaire : ${item.comment}` : '',
      '',
      'Bien cordialement,',
      'Chapitre PMI RDC'
    ].filter(line => line !== '').join('\n');
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function renderProfiles(profiles) {
    const body = document.getElementById('profilesBody');
    body.innerHTML = '';
    profiles.forEach(profile => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(profile.email)}</td>
        <td>${escapeHtml(profile.pmiId)}</td>
        <td>${profile.gender === 'M' ? '👨 M' : profile.gender === 'F' ? '👩 F' : ''}</td>
        <td>${profile.occupationStatus === 'Etudiant' ? '🎓 Étudiant' : profile.occupationStatus === 'Professionnel' ? '💼 Professionnel' : ''}</td>
        <td>${roleText(profile.roles.member, '💜')}</td>
        <td>${roleText(profile.roles.volunteer, '🙋')}</td>
        <td><button class="delete-click" type="button" data-delete="${escapeHtml(profile.email || profile.pmiId)}">❌ Supprimer</button></td>
      `;
      body.appendChild(tr);
    });
    body.querySelectorAll('[data-delete]').forEach(button => {
      button.addEventListener('click', async () => {
        if (!confirm(`Supprimer ${button.dataset.delete} ?`)) return;
        await deleteProfile(button.dataset.delete);
        await logAction('suppression profil', { email: button.dataset.delete, details: 'Profil supprime depuis le dashboard.' });
        await refreshDashboard();
      });
    });
    if (!body.children.length) body.innerHTML = '<tr><td colspan="7">Aucun profil.</td></tr>';
  }

  async function renderLogs() {
    const body = document.getElementById('logsBody');
    if (!body) return;
    const logs = await loadLogs();
    body.innerHTML = '';
    logs.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(formatDateTime(item.timestamp))}</td>
        <td>${escapeHtml(item.action)}</td>
        <td>${escapeHtml(item.email || '')}</td>
        <td>${escapeHtml(item.pmiId || '')}</td>
        <td>${escapeHtml(item.browserLocation || '')}</td>
        <td>${escapeHtml(item.details || '')}</td>
      `;
      body.appendChild(tr);
    });
    if (!body.children.length) body.innerHTML = '<tr><td colspan="6">Aucune action journalisee.</td></tr>';
  }

  function roleText(role, emoji) {
    if (!role.active) return 'Inactif';
    return `${emoji} ${escapeHtml(normalizeZoneName(role.zoneName))} (${escapeHtml(role.zoneType)})`;
  }

  function periodKey(period, mode) {
    const [year, month] = period.split('-').map(Number);
    if (mode === 'year') return String(year);
    if (mode === 'quarter') return `${year}-T${Math.ceil(month / 3)}`;
    return period;
  }

  async function exportCsv() {
    const profiles = await loadProfiles();
    const rows = [
      ['Email', 'PMI ID', 'Sexe', 'Statut', 'Membre actif', 'Province membre', 'Volontaire actif', 'Province volontaire'],
      ...profiles.map(profile => [
        profile.email,
        profile.pmiId,
        profile.gender,
        profile.occupationStatus === 'Etudiant' ? 'Étudiant' : profile.occupationStatus,
        profile.roles.member.active ? 'Oui' : 'Non',
        normalizeZoneName(profile.roles.member.zoneName),
        profile.roles.volunteer.active ? 'Oui' : 'Non',
        normalizeZoneName(profile.roles.volunteer.zoneName)
      ])
    ];
    downloadText(rows.map(row => row.map(csvCell).join(',')).join('\n'), `PMI_RDC_dashboard_${today()}.csv`, 'text/csv;charset=utf-8');
  }

  function exportPng() {
    const source = document.getElementById('provinceChart');
    const link = document.createElement('a');
    link.href = source.toDataURL('image/png');
    link.download = `PMI_RDC_histogramme_${today()}.png`;
    link.click();
  }

  function countBy(profiles, key) {
    return profiles.reduce((acc, profile) => {
      const value = profile[key] || 'Non renseigne';
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  function average(values) {
    const valid = values.map(Number).filter(value => Number.isFinite(value) && value > 0);
    if (!valid.length) return 0;
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
  }

  function moodEmoji(avg) {
    if (!avg) return '-';
    if (avg < 2) return '\u{1f61f}';
    if (avg < 3) return '\u{1f610}';
    if (avg < 4) return '\u{1f642}';
    if (avg < 4.5) return '\u{1f60a}';
    return '\u{1f604}';
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizePmiId(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function normalizeZoneName(value) {
    const name = String(value || '').trim();
    return zoneAliases[name] || name;
  }

  function cryptoId() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setStatus(message, type) {
    const box = document.getElementById('statusBox');
    if (!box) return;
    box.className = `status ${type || ''}`;
    box.textContent = message;
  }

  function setBusy(isBusy, message) {
    const banner = document.getElementById('loadingBanner');
    if (banner) {
      banner.textContent = message || 'Chargement en cours...';
      banner.hidden = !isBusy;
    }
    document.querySelectorAll('#registrationModal button, #registrationModal input, #registrationModal select, #registrationModal textarea, #saveSurvey')
      .forEach(el => {
        if (el.id === 'closeRegistration') return;
        if (isBusy) {
          if (!el.disabled) el.dataset.busyDisabled = 'true';
          el.disabled = true;
        } else if (el.dataset.busyDisabled === 'true') {
          el.disabled = false;
          delete el.dataset.busyDisabled;
        }
      });
  }

  function showToast(title, lines) {
    const toast = document.getElementById('successToast');
    if (!toast) return;
    clearTimeout(window.pmiToastTimer);
    toast.innerHTML = `<strong>${escapeHtml(title)}</strong>${lines.map(line => `<span>${escapeHtml(line)}</span>`).join('')}`;
    toast.hidden = false;
    window.pmiToastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 5000);
  }

  function setDashboardStatus(message, type) {
    const box = document.getElementById('dashboardStatus');
    if (!box) return;
    box.className = `status ${type || ''}`;
    box.textContent = message;
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/"/g, '\\"');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  function downloadText(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('fr-FR');
  }

  function currentPeriod() {
    return new Date().toISOString().slice(0, 7);
  }

  function checkedValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
  }

  window.PMIMapApp = {
    initHome,
    initDashboard
  };
})();
