(function () {
  const PROFILE_KEY = 'pmi-rdc-map-profiles-v2';
  const SAT_KEY = 'pmi-rdc-map-satisfaction-v1';
  const LOG_KEY = 'pmi-rdc-map-logs-v1';

  const continents = [
    'Afrique hors RDC',
    'Europe',
    'Amerique du Nord',
    'Amerique latine',
    'Asie',
    'Oceanie'
  ];

  const continentGlobes = {
    'Afrique hors RDC': '🌍',
    Europe: '🌍',
    'Amerique du Nord': '🌎',
    'Amerique latine': '🌎',
    Asie: '🌏',
    Oceanie: '🌏'
  };

  const provinceNameMap = {
    'Central Kasai': 'Kasai-Central',
    'Lower Uele': 'Bas-Uele',
    'North Kivu': 'Nord-Kivu',
    'South Kivu': 'Sud-Kivu',
    'Upper Uele': 'Haut-Uele',
    'Équateur': 'Equateur',
    'Ã‰quateur': 'Equateur'
  };

  const palette = [
    '#4f17a8', '#00b5d1', '#ff671f', '#7aa6c2', '#59a14f', '#b07aa1',
    '#f1ce63', '#86bc86', '#d4a6c8', '#9c755f', '#e15759', '#76b7b2'
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
    const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_profiles?on_conflict=email`, {
      method: 'POST',
      headers: Object.assign({}, supabaseHeaders(), { Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await supabaseError(response, 'Supabase a refuse la mise a jour du profil.'));
  }

  async function deleteProfile(email) {
    const profiles = (await loadProfiles()).filter(profile => profile.email !== email);
    if (!isSupabaseConfigured()) {
      writeJson(PROFILE_KEY, profiles);
      return profiles;
    }
    const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_profiles?email=eq.${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: supabaseHeaders()
    });
    if (!response.ok) throw new Error(await supabaseError(response, 'La suppression Supabase a echoue.'));
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
    if (!satisfactionResponse.ok) throw new Error(await supabaseError(satisfactionResponse, 'La suppression des satisfactions Supabase a echoue.'));
    const profileResponse = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_profiles?id=not.is.null`, { method: 'DELETE', headers });
    if (!profileResponse.ok) throw new Error(await supabaseError(profileResponse, 'La suppression des profils Supabase a echoue.'));
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
    if (!response.ok) throw new Error(await supabaseError(response, 'La remise a zero des satisfactions Supabase a echoue.'));
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
      email: item.email,
      pmi_id: item.pmiId,
      period: item.period,
      rating: item.rating,
      comment: item.comment || ''
    };
    if (isSupabaseConfigured()) {
      const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_satisfaction?on_conflict=email,period`, {
        method: 'POST',
        headers: Object.assign({}, supabaseHeaders(), { Prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify(row)
      });
      if (!response.ok) throw new Error(await supabaseError(response, 'Supabase a refuse la satisfaction.'));
    }
    const items = readJson(SAT_KEY, []);
    const index = items.findIndex(existing => existing.email === item.email && existing.period === item.period);
    if (index >= 0) items[index] = Object.assign({}, items[index], item);
    else items.push(item);
    writeJson(SAT_KEY, items);
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
      email: profile.email,
      pmi_id: profile.pmiId,
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

  function applyRoleOperation(profile, roleChoice, action, zoneName, zoneType) {
    const roles = selectedRoles(roleChoice);
    const now = new Date().toISOString();
    if (!roles.length) return { ok: false, message: 'Choisissez membre, volontaire ou les deux.' };

    if (action === 'cancel') {
      const active = roles.filter(role => profile.roles[role].active);
      if (!active.length) return { ok: false, message: 'Aucun role correspondant a annuler pour ce profil.' };
      active.forEach(role => {
        profile.roles[role] = { active: false, zoneName: '', zoneType: '', updatedAt: now };
      });
      return { ok: true, message: `Annulation effectuee pour ${active.map(roleLabel).join(' et ')}.` };
    }

    const hasMember = profile.roles.member.active;
    const hasVolunteer = profile.roles.volunteer.active;
    if (roleChoice === 'both' && (hasMember || hasVolunteer)) {
      const existing = hasMember && hasVolunteer ? 'membre et volontaire' : (hasMember ? 'membre' : 'volontaire');
      return { ok: false, message: `Vous etes deja enregistre comme ${existing}. Modifiez ou annulez un statut precis au lieu de choisir Membre et volontaire.` };
    }

    roles.forEach(role => {
      profile.roles[role] = { active: true, zoneName, zoneType, updatedAt: now };
    });

    let message = `Localisation enregistree pour ${roles.map(roleLabel).join(' et ')}.`;
    const newSecondRole = roles.length === 1 && ((roles[0] === 'member' && hasVolunteer) || (roles[0] === 'volunteer' && hasMember));
    if (newSecondRole) {
      profile.roles.member.zoneName = zoneName;
      profile.roles.member.zoneType = zoneType;
      profile.roles.member.updatedAt = now;
      profile.roles.volunteer.zoneName = zoneName;
      profile.roles.volunteer.zoneType = zoneType;
      profile.roles.volunteer.updatedAt = now;
      message += ' La nouvelle province remplace aussi la province du role deja actif.';
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
      if (profile.roles.member.active && zones[profile.roles.member.zoneName]) {
        zones[profile.roles.member.zoneName].members += 1;
        activeZones.add(profile.roles.member.zoneName);
      }
      if (profile.roles.volunteer.active && zones[profile.roles.volunteer.zoneName]) {
        zones[profile.roles.volunteer.zoneName].volunteers += 1;
        activeZones.add(profile.roles.volunteer.zoneName);
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
      const group = createSvgElement('g', { class: 'province' });
      const shape = createSvgElement('path', {
        d: featureToPath(province.feature, projection),
        fill: province.color,
        tabindex: '0',
        role: 'button',
        'aria-label': province.name
      });
      shape.addEventListener('click', () => onZoneClick(province.name, 'Province'));
      shape.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onZoneClick(province.name, 'Province');
        }
      });
      group.appendChild(shape);
      root.appendChild(group);
      return { province, center };
    });
    drawLabels(items, labels);
  }

  function drawLabels(items, labelsRoot) {
    const left = items.filter(item => item.center[0] < 580).sort((a, b) => a.center[1] - b.center[1]);
    const right = items.filter(item => item.center[0] >= 580).sort((a, b) => a.center[1] - b.center[1]);
    placeLabels(left, 16, labelsRoot);
    placeLabels(right, 1148, labelsRoot);
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
    continents.forEach(name => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'continent';
      button.dataset.zone = name;
      button.innerHTML = `<span class="continent-main"><span class="continent-globe" aria-hidden="true">${continentGlobes[name] || '🌍'}</span><span><strong>${name}</strong><span class="mini-count" data-continent="${name}">M: 0 | V: 0</span></span></span><span>Choisir</span>`;
      button.addEventListener('click', () => onZoneClick(name, 'Continent'));
      root.appendChild(button);
    });
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
    setText('totalMembers', total.members);
    setText('totalVolunteers', total.volunteers);
    setText('totalUnique', total.people);
    Object.entries(stats).forEach(([name, item]) => {
      document.querySelectorAll(`[data-zone-count="${cssEscape(name)}"]`).forEach(el => {
        el.textContent = `M: ${item.members} | V: ${item.volunteers}`;
      });
      const continent = document.querySelector(`[data-continent="${cssEscape(name)}"]`);
      if (continent) continent.textContent = `M: ${item.members} | V: ${item.volunteers}`;
    });
  }

  function renderGlobalMood(items) {
    const month = currentPeriod();
    const year = month.slice(0, 4);
    const monthAvg = average(items.filter(item => item.period === month).map(item => item.rating));
    const yearAvg = average(items.filter(item => item.period && item.period.slice(0, 4) === year).map(item => item.rating));
    setText('monthMoodScore', `Mois ${monthAvg.toFixed(1)}/5`);
    setText('monthMoodEmoji', moodEmoji(monthAvg));
    setText('yearMoodScore', `Annee ${yearAvg.toFixed(1)}/5`);
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
    ctx.fillText("Votes par nombre d'etoiles - moyenne annuelle arrondie par votant", left, 30);
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
      ctx.fillText(`${rating} etoile${rating > 1 ? 's' : ''}`, x + barW / 2, bottom + 28);
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

  function readIdentity() {
    const identity = {
      email: document.getElementById('email').value,
      pmiId: document.getElementById('pmiId').value,
      gender: checkedValue('gender'),
      occupationStatus: checkedValue('occupationStatus')
    };
    if (!identity.email && !identity.pmiId) {
      throw new Error('Renseignez au moins email ou PMI ID.');
    }
    if (!identity.gender || !identity.occupationStatus) {
      throw new Error('Completez sexe et statut.');
    }
    if (identity.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)) throw new Error('Email invalide.');
    return identity;
  }

  async function handleZone(zoneName, zoneType) {
    setText('selectedZone', `Zone selectionnee : ${zoneName}`);
    try {
      const identity = readIdentity();
      const roleChoice = document.getElementById('roleChoice').value;
      const action = document.getElementById('roleAction').value;
      if (action === 'cancel') {
        throw new Error('Pour annuler, utilisez le bouton Appliquer une annulation. Aucun nouveau clic sur la carte n est necessaire.');
      }
      const profiles = await loadProfiles();
      const email = normalizeEmail(identity.email);
      const pmiId = normalizePmiId(identity.pmiId);
      let profile = profiles.find(item => (email && item.email === email) || (pmiId && item.pmiId === pmiId));
      if (profile && email && profile.email !== email) throw new Error('Ce PMI ID est deja associe a un autre email.');
      if (profile && pmiId && profile.pmiId !== pmiId) throw new Error('Cet email est deja associe a un autre PMI ID.');
      if (!profile) {
        if (!email || !pmiId) throw new Error('Pour une premiere localisation, renseignez email et PMI ID.');
        profile = blankProfile(identity);
        profiles.push(profile);
      }
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
      setStatus(result.message, 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function handleCancel() {
    try {
      const identity = readIdentity();
      const roleChoice = document.getElementById('roleChoice').value;
      const profiles = await loadProfiles();
      const email = normalizeEmail(identity.email);
      const pmiId = normalizePmiId(identity.pmiId);
      const profile = profiles.find(item => (email && item.email === email) || (pmiId && item.pmiId === pmiId));
      if (!profile) throw new Error('Aucune localisation trouvee pour cet email ou ce PMI ID.');
      if (email && profile.email !== email) throw new Error('Ce PMI ID est associe a un autre email.');
      if (pmiId && profile.pmiId !== pmiId) throw new Error('Cet email est associe a un autre PMI ID.');
      const result = applyRoleOperation(profile, roleChoice, 'cancel', '', '');
      if (!result.ok) throw new Error(result.message);
      await saveProfiles(profiles);
      await logAction('annulation', {
        email: profile.email,
        pmiId: profile.pmiId,
        details: `${result.message} Choix: ${roleChoice}.`
      });
      await refreshHome();
      setStatus(result.message, 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function updateProfileInfo() {
    try {
      const identity = readIdentity();
      const profiles = await loadProfiles();
      const email = normalizeEmail(identity.email);
      const pmiId = normalizePmiId(identity.pmiId);
      const profile = profiles.find(item => (email && item.email === email) || (pmiId && item.pmiId === pmiId));
      if (!profile) throw new Error('Aucun profil trouve pour cet email ou ce PMI ID.');
      profile.gender = identity.gender;
      profile.occupationStatus = identity.occupationStatus;
      await saveProfiles(profiles);
      await logAction('mise a jour profil', {
        email: profile.email,
        pmiId: profile.pmiId,
        details: `Sexe: ${profile.gender}. Statut: ${profile.occupationStatus}.`
      });
      await refreshHome();
      setStatus('Sexe/statut mis a jour.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
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

  async function initHome() {
    const month = document.getElementById('surveyMonth');
    if (month) month.value = currentPeriod();
    initMap(handleZone);
    initContinents(handleZone);
    const getRating = setupStars();
    document.getElementById('saveSurvey').addEventListener('click', async () => {
      try {
        const identity = readIdentity();
        if (!identity.email || !identity.pmiId) throw new Error('Pour la satisfaction, renseignez email et PMI ID.');
        const rating = getRating();
        if (!rating) throw new Error('Choisissez une note de satisfaction de 1 a 5.');
        const period = currentPeriod();
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
          details: `Periode: ${period}. Note: ${rating}/5.`
        });
        await refreshHome();
        setStatus('Satisfaction mensuelle enregistree.', 'success');
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });
    document.getElementById('applyCancel').addEventListener('click', handleCancel);
    document.getElementById('updateProfileInfo').addEventListener('click', updateProfileInfo);
    await refreshHome();
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
      await logAction('remise a zero satisfactions', { details: 'Toutes les satisfactions ont ete effacees.' });
      await refreshDashboard();
      setDashboardStatus('Satisfactions remises a zero.', 'success');
    });
    document.getElementById('resetAll').addEventListener('click', async () => {
      if (!confirm('Effacer tous les profils et toutes les satisfactions ?')) return;
      await resetAllData();
      await logAction('remise a zero generale', { details: 'Profils et satisfactions effaces. Logs conserves.' });
      await refreshDashboard();
      setDashboardStatus('Donnees effacees.', 'success');
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
      box.textContent = 'Base non configuree : les donnees restent dans ce navigateur et ne sont pas partagees.';
      return;
    }
    try {
      const response = await fetch(`${supabaseUrl()}/rest/v1/pmi_drc_map_satisfaction?select=id&limit=1`, {
        headers: supabaseHeaders(),
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(await supabaseError(response, 'Lecture test Supabase impossible.'));
      box.className = 'status success';
      box.textContent = 'Base configuree : la page lit et ecrit dans Supabase.';
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
    logAction('configuration supabase', { details: `Fichier config genere. URL: ${url || 'vide'}.` }).catch(() => {});
    setDashboardStatus('Fichier supabase-config.js genere. Publiez ce fichier pour appliquer la configuration a tous les navigateurs.', 'success');
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
      drawPieChart('occupationChart', countBy(profiles, 'occupationStatus'), 'Etudiant / Professionnel');
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
    const pad = 48;
    const barW = Math.max(10, (canvas.width - pad * 2) / entries.length - 4);
    ctx.fillStyle = '#1b1f2a';
    ctx.font = '20px Aptos, Calibri, Tahoma, Arial';
    ctx.fillText('Membres et volontaires par province', pad, 30);
    entries.forEach(([name, item], index) => {
      const x = pad + index * (barW + 4);
      const memberH = item.members / max * 330;
      const volunteerH = item.volunteers / max * 330;
      ctx.fillStyle = '#4f17a8';
      ctx.fillRect(x, 420 - memberH, barW / 2, memberH);
      ctx.fillStyle = '#00b5d1';
      ctx.fillRect(x + barW / 2, 420 - volunteerH, barW / 2, volunteerH);
      ctx.save();
      ctx.translate(x + 2, 485);
      ctx.rotate(-Math.PI / 3);
      ctx.fillStyle = '#344054';
      ctx.font = '11px Aptos, Calibri, Tahoma, Arial';
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
    ctx.fillStyle = '#1b1f2a';
    ctx.font = '18px Aptos, Calibri, Tahoma, Arial';
    ctx.fillText(title, 22, 28);
    entries.forEach(([label, value], index) => {
      const angle = value / total * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(150, 150);
      ctx.arc(150, 150, 88, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = colors[index % colors.length];
      ctx.fill();
      start += angle;
      ctx.fillRect(290, 70 + index * 28, 14, 14);
      ctx.fillStyle = '#1b1f2a';
      ctx.font = '13px Aptos, Calibri, Tahoma, Arial';
      ctx.fillText(`${label}: ${value}`, 312, 82 + index * 28);
    });
  }

  function clearCanvas(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function renderNiko(items) {
    const period = document.getElementById('nikoPeriod').value;
    const groups = {};
    items.forEach(item => {
      const key = periodKey(item.period, period);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    const body = document.getElementById('nikoBody');
    body.innerHTML = '';
    Object.keys(groups).sort().forEach(key => {
      const group = groups[key];
      const avg = average(group.map(item => item.rating));
      const comments = group.map(item => item.comment).filter(Boolean).join(' | ');
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(key)}</td><td>${avg.toFixed(1)}</td><td>${moodEmoji(avg)}</td><td>${escapeHtml(comments)}</td>`;
      body.appendChild(tr);
    });
    if (!body.children.length) body.innerHTML = '<tr><td colspan="4">Aucune satisfaction enregistree.</td></tr>';
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
        <td>${profile.occupationStatus === 'Etudiant' ? '🎓 Etudiant' : profile.occupationStatus === 'Professionnel' ? '💼 Professionnel' : ''}</td>
        <td>${roleText(profile.roles.member, '💜')}</td>
        <td>${roleText(profile.roles.volunteer, '🙋')}</td>
        <td><button class="delete-click" type="button" data-delete="${escapeHtml(profile.email)}">❌ Supprimer</button></td>
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
    return `${emoji} ${escapeHtml(role.zoneName)} (${escapeHtml(role.zoneType)})`;
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
        profile.occupationStatus,
        profile.roles.member.active ? 'Oui' : 'Non',
        profile.roles.member.zoneName,
        profile.roles.volunteer.active ? 'Oui' : 'Non',
        profile.roles.volunteer.zoneName
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
