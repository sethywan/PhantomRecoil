// State
let currentTab = 'attackers';
let searchQuery = '';
let favorites = loadFavorites();
let userDpi = loadDpi();
let weaponIntensityMap = loadWeaponIntensityMap();
let selectedOperator = null;
let selectedWeapon = null;
let capsPollIntervalId = null;
let pywebviewReady = false;
let renderScheduled = false;
let renderToken = 0;
let lastTabSwitchAt = 0;
let renderInProgress = false;
let renderQueued = false;
let diagIntervalId = null;
let perfIntervalId = null;
let capsRequestInFlight = false;
let heartbeatInFlight = false;
let appInfoLoaded = false;
let lastClientEventAt = 0;
const CLIENT_EVENT_MIN_INTERVAL_MS = 400;
const ENABLE_REMOTE_ASSETS = true;
const TAB_SWITCH_DEBOUNCE_MS = 220;
const ICON_CACHE_NAME = 'phantom-recoil-icons-v1';
let lastDiagDumpAt = 0;
const DIAG_DUMP_COOLDOWN_MS = 15000;

// DOM Elements
const grid = document.getElementById('operators-grid');
const searchInput = document.getElementById('search-input');
const tabBtns = document.querySelectorAll('.tab-btn');
const intensitySlider = document.getElementById('intensity');
const intensityVal = document.getElementById('intensity-val');
const dpiInput = document.getElementById('dpi-input');

function loadFavorites() {
    try {
        const raw = localStorage.getItem('r6_favorites');
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter((item) => typeof item === 'string' && item.trim().length > 0);
    } catch (err) {
        console.warn('[Storage] Invalid favorites found, resetting.', err);
        return [];
    }
}

function saveFavorites() {
    localStorage.setItem('r6_favorites', JSON.stringify(favorites));
}

function clampDpi(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return 400;
    }
    return Math.max(100, Math.min(32000, parsed));
}

function loadDpi() {
    try {
        return clampDpi(localStorage.getItem('r6_dpi') || '400');
    } catch (err) {
        console.warn('[Storage] Invalid DPI found, using default.', err);
        return 400;
    }
}

function saveDpi(value) {
    userDpi = clampDpi(value);
    localStorage.setItem('r6_dpi', String(userDpi));
    if (dpiInput) {
        dpiInput.value = String(userDpi);
    }
}

function clampIntensity(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return 0.5;
    }
    return Math.max(0.01, Math.min(1.0, parsed));
}

function getWeaponKey(operator, weapon) {
    const op = slugify(operator && operator.name ? operator.name : 'unknown-op');
    const wep = slugify(weapon && weapon.name ? weapon.name : 'unknown-weapon');
    return `${op}::${wep}`;
}

function loadWeaponIntensityMap() {
    try {
        const raw = localStorage.getItem('r6_weapon_intensity');
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }

        const cleaned = {};
        Object.keys(parsed).forEach((key) => {
            cleaned[key] = clampIntensity(parsed[key]);
        });
        return cleaned;
    } catch (err) {
        console.warn('[Storage] Invalid weapon intensity map, resetting.', err);
        return {};
    }
}

function saveWeaponIntensityMap() {
    localStorage.setItem('r6_weapon_intensity', JSON.stringify(weaponIntensityMap));
}

function getWeaponIntensity(operator, weapon) {
    const key = getWeaponKey(operator, weapon);
    if (!Object.prototype.hasOwnProperty.call(weaponIntensityMap, key)) {
        return null;
    }
    return clampIntensity(weaponIntensityMap[key]);
}

function setWeaponIntensity(operator, weapon, value) {
    const key = getWeaponKey(operator, weapon);
    weaponIntensityMap[key] = clampIntensity(value);
    saveWeaponIntensityMap();
    return weaponIntensityMap[key];
}

function isPyWebViewAvailable() {
    return Boolean(window.pywebview && window.pywebview.api);
}

async function resolveCachedIconUrl(url) {
    if (!ENABLE_REMOTE_ASSETS || !url) {
        return null;
    }

    if (typeof window.caches === 'undefined') {
        return url;
    }

    try {
        const cache = await window.caches.open(ICON_CACHE_NAME);
        let response = await cache.match(url);

        if (!response) {
            const fetched = await fetch(url, { cache: 'force-cache' });
            if (!fetched.ok) {
                return url;
            }
            response = fetched.clone();
            cache.put(url, fetched).catch(() => {
                // Best effort only.
            });
        }

        const blob = await response.blob();
        return URL.createObjectURL(blob);
    } catch (err) {
        console.warn('[Icons] Failed to resolve cached icon URL.', err);
        return url;
    }
}

function setImageSourceWithCache(imgElement, url, onFallback) {
    if (!imgElement || !ENABLE_REMOTE_ASSETS) {
        if (typeof onFallback === 'function') {
            onFallback();
        }
        return;
    }

    let createdBlobUrl = null;
    const cleanupBlobUrl = () => {
        if (createdBlobUrl) {
            const urlToRevoke = createdBlobUrl;
            createdBlobUrl = null;
            window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 2500);
        }
    };

    imgElement.addEventListener('load', cleanupBlobUrl, { once: true });
    imgElement.addEventListener('error', () => {
        cleanupBlobUrl();
        if (typeof onFallback === 'function') {
            onFallback();
        }
    }, { once: true });

    resolveCachedIconUrl(url)
        .then((resolvedUrl) => {
            if (!resolvedUrl) {
                if (typeof onFallback === 'function') {
                    onFallback();
                }
                return;
            }

            if (resolvedUrl.startsWith('blob:')) {
                createdBlobUrl = resolvedUrl;
            }

            imgElement.src = resolvedUrl;
        })
        .catch(() => {
            imgElement.src = url;
        });
}

function sendClientEvent(level, message, context) {
    if (!isPyWebViewAvailable()) {
        return;
    }

    const now = Date.now();
    if (level !== 'error' && now - lastClientEventAt < CLIENT_EVENT_MIN_INTERVAL_MS) {
        return;
    }
    lastClientEventAt = now;

    window.pywebview.api.log_client_event(level, message, context || {}).catch(() => {
        // Ignore telemetry failures to keep UI path non-blocking.
    });
}

function maybeRequestDiagDump(reason, context) {
    if (!isPyWebViewAvailable()) {
        return;
    }

    const now = Date.now();
    if (now - lastDiagDumpAt < DIAG_DUMP_COOLDOWN_MS) {
        return;
    }
    lastDiagDumpAt = now;

    window.pywebview.api.dump_diagnostics(reason)
        .then(() => {
            sendClientEvent('warning', 'diagnostic dump requested', context || {});
        })
        .catch((err) => {
            console.error('[PyWebView API Error] dump_diagnostics failed', err);
        });
}

function updateVersionLabel(appInfo) {
    const versionEl = document.getElementById('app-version');
    if (!versionEl) {
        return;
    }

    const version = String((appInfo && appInfo.version) || '').trim();
    if (!version) {
        versionEl.textContent = '';
        return;
    }
    versionEl.textContent = version;
}

function fetchAppInfo() {
    if (!isPyWebViewAvailable() || appInfoLoaded) {
        return;
    }

    window.pywebview.api.get_app_info()
        .then((info) => {
            appInfoLoaded = true;
            if (info && typeof info.title === 'string' && info.title.length > 0) {
                document.title = info.title;
            }
            updateVersionLabel(info || {});
            sendClientEvent('info', 'app info loaded', {
                version: info && info.version,
                session: info && info.session_id,
            });
        })
        .catch((err) => {
            console.error('[PyWebView API Error] get_app_info failed', err);
        });
}

function startDiagnosticHeartbeat() {
    if (!isPyWebViewAvailable()) {
        return;
    }
    if (diagIntervalId !== null) {
        return;
    }

    diagIntervalId = window.setInterval(() => {
        if (!isPyWebViewAvailable()) {
            return;
        }

        if (heartbeatInFlight) {
            return;
        }

        heartbeatInFlight = true;

        window.pywebview.api.ping({
            tab: currentTab,
            searchLength: searchQuery.length,
            renderInProgress,
            renderQueued,
            ts: Date.now(),
        }).catch(() => {
            // Avoid recursive error loops on a failing bridge.
        }).finally(() => {
            heartbeatInFlight = false;
        });
    }, 3000);
}

function stopDiagnosticHeartbeat() {
    if (diagIntervalId !== null) {
        window.clearInterval(diagIntervalId);
        diagIntervalId = null;
    }
}

function slugify(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function setStatusIndicator(isOn) {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    if (!indicator || !text) {
        return;
    }

    if (isOn) {
        indicator.classList.remove('idle');
        indicator.classList.add('active');
        text.textContent = 'ON';
    } else {
        indicator.classList.remove('active');
        indicator.classList.add('idle');
        text.textContent = 'OFF';
    }
}

function startCapsPolling() {
    if (!isPyWebViewAvailable()) {
        return;
    }
    if (capsPollIntervalId !== null) {
        return;
    }

    capsPollIntervalId = window.setInterval(() => {
        if (!isPyWebViewAvailable()) {
            setStatusIndicator(false);
            return;
        }

        if (capsRequestInFlight) {
            return;
        }

        capsRequestInFlight = true;

        window.pywebview.api.get_caps_state()
            .then((isOn) => setStatusIndicator(Boolean(isOn)))
            .catch((err) => {
                console.error('[PyWebView API Error] get_caps_state failed', err);
                setStatusIndicator(false);
            })
            .finally(() => {
                capsRequestInFlight = false;
            });
    }, 900);
}

function stopCapsPolling() {
    if (capsPollIntervalId !== null) {
        window.clearInterval(capsPollIntervalId);
        capsPollIntervalId = null;
    }
    capsRequestInFlight = false;
}

function startPerformanceMonitor() {
    if (perfIntervalId !== null) {
        return;
    }

    let expectedTs = Date.now() + 1000;
    perfIntervalId = window.setInterval(() => {
        const now = Date.now();
        const drift = now - expectedTs;
        expectedTs = now + 1000;

        if (drift > 600) {
            sendClientEvent('warning', 'Event loop lag detected', {
                driftMs: drift,
                tab: currentTab,
                renderInProgress,
                renderQueued,
                searchLength: searchQuery.length,
            });
            if (drift > 1200) {
                maybeRequestDiagDump('event-loop-lag', {
                    driftMs: drift,
                    tab: currentTab,
                });
            }
        }
    }, 1000);
}

function stopPerformanceMonitor() {
    if (perfIntervalId !== null) {
        window.clearInterval(perfIntervalId);
        perfIntervalId = null;
    }
}

function sendMultiplierToBackend(value) {
    const safeValue = clampIntensity(value);
    intensityVal.textContent = `${safeValue.toFixed(2)}x`;

    if (isPyWebViewAvailable()) {
        window.pywebview.api.set_multiplier(safeValue).catch((err) => {
            console.error('[PyWebView API Error] set_multiplier failed', err);
        });
    }

    return safeValue;
}

function updateSidebarSelection(operator, weapon) {
    const avatarEl = document.getElementById('selected-op-initials');
    const selectedName = document.getElementById('selected-name');
    const selectedWeaponName = document.getElementById('selected-weapon');
    const valX = document.getElementById('val-x');
    const valY = document.getElementById('val-y');

    if (!avatarEl || !selectedName || !selectedWeaponName || !valX || !valY) {
        return;
    }

    const initials = operator.name.substring(0, 2).toUpperCase();
    avatarEl.replaceChildren();
    avatarEl.style.background = 'var(--bg-card)';
    avatarEl.textContent = initials;

    if (ENABLE_REMOTE_ASSETS) {
        const badgeUrl = `https://trackercdn.com/cdn/r6.tracker.network/operators/badges/${slugify(operator.name)}.png`;
        avatarEl.style.background = 'transparent';
        avatarEl.replaceChildren();

        const img = document.createElement('img');
        img.alt = initials;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        img.style.border = '2px solid var(--accent)';
        const fallback = () => {
            avatarEl.replaceChildren();
            avatarEl.style.background = 'var(--bg-card)';
            avatarEl.textContent = initials;
        };

        avatarEl.appendChild(img);
        setImageSourceWithCache(img, badgeUrl, fallback);
    }

    selectedName.textContent = operator.name;
    selectedWeaponName.textContent = weapon.name;
    valX.textContent = String(weapon.x);
    valY.textContent = String(weapon.y);
}

function selectWeapon(operator, weapon) {
    selectedOperator = operator;
    selectedWeapon = weapon;

    if (intensitySlider) {
        const rememberedIntensity = getWeaponIntensity(operator, weapon);
        let nextIntensity = rememberedIntensity;

        if (nextIntensity === null) {
            nextIntensity = clampIntensity(intensitySlider.value);
            setWeaponIntensity(operator, weapon, nextIntensity);
        }

        intensitySlider.value = nextIntensity.toFixed(2);
        sendMultiplierToBackend(nextIntensity);
    }

    updateSidebarSelection(operator, weapon);

    const dpiMultiplier = 400 / clampDpi(userDpi);
    const scaledX = Number(weapon.x) * dpiMultiplier;
    const scaledY = Number(weapon.y) * dpiMultiplier;

    if (isPyWebViewAvailable()) {
        window.pywebview.api.set_recoil(scaledX, scaledY).catch((err) => {
            console.error('[PyWebView API Error] set_recoil failed', err);
        });
    } else {
        console.log(
            `[DEV Mock] Selected ${operator.name} - ${weapon.name} | Base X:${weapon.x} Y:${weapon.y} | Scaled X:${scaledX} Y:${scaledY}`
        );
    }

    syncSelectedWeaponButtons();
}

function syncSelectedWeaponButtons() {
    const buttons = document.querySelectorAll('.weapon-btn');
    if (!buttons || buttons.length === 0) {
        return;
    }

    const selectedOpName = selectedOperator && selectedOperator.name ? selectedOperator.name : '';
    const selectedWeaponName = selectedWeapon && selectedWeapon.name ? selectedWeapon.name : '';

    buttons.forEach((btn) => {
        const matches = btn.dataset.opName === selectedOpName && btn.dataset.weaponName === selectedWeaponName;
        btn.classList.toggle('selected', matches);
    });
}

function toggleFavorite(opName) {
    if (favorites.includes(opName)) {
        favorites = favorites.filter((fav) => fav !== opName);
    } else {
        favorites.push(opName);
    }
    saveFavorites();
    requestRender();
}

function createWeaponButton(operator, weapon) {
    const btn = document.createElement('button');
    btn.className = 'weapon-btn';
    if (selectedOperator?.name === operator.name && selectedWeapon?.name === weapon.name) {
        btn.classList.add('selected');
    }

    btn.type = 'button';
    btn.setAttribute('aria-label', `${operator.name} ${weapon.name} recoil profile`);
    btn.dataset.opName = operator.name;
    btn.dataset.weaponName = weapon.name;

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '8px';

    const weaponName = document.createElement('span');
    weaponName.className = 'weapon-name';
    weaponName.textContent = weapon.name;

    if (ENABLE_REMOTE_ASSETS) {
        const weaponImg = document.createElement('img');
        const weaponUrl = `https://trackercdn.com/cdn/r6.tracker.network/weapons/${slugify(weapon.name)}.png`;
        weaponImg.alt = '';
        weaponImg.setAttribute('aria-hidden', 'true');
        weaponImg.style.width = '28px';
        weaponImg.style.height = '14px';
        weaponImg.loading = 'lazy';
        weaponImg.style.objectFit = 'contain';
        weaponImg.style.filter = 'drop-shadow(0 1px 1px rgba(0,0,0,0.8))';
        const fallback = () => {
            weaponImg.style.display = 'none';
        };
        setImageSourceWithCache(weaponImg, weaponUrl, fallback);
        left.appendChild(weaponImg);
    }
    left.appendChild(weaponName);

    const stats = document.createElement('span');
    stats.className = 'weapon-stats';
    stats.textContent = `X${weapon.x} Y${weapon.y}`;

    btn.appendChild(left);
    btn.appendChild(stats);
    btn.addEventListener('click', () => selectWeapon(operator, weapon));

    return btn;
}

function createOperatorCard(operator) {
    const isFav = favorites.includes(operator.name);
    const groupEl = document.createElement('div');
    groupEl.className = 'op-group';
    groupEl.style.borderTop = `2px solid ${operator.role === 'Attacker' ? 'var(--attacker)' : 'var(--defender)'}`;

    const header = document.createElement('div');
    header.className = 'op-header';

    const opInfo = document.createElement('div');
    opInfo.className = 'op-info';

    const avatar = document.createElement('div');
    avatar.className = 'small-avatar';
    avatar.style.overflow = 'hidden';
    avatar.style.position = 'relative';
    avatar.style.background = 'var(--bg-dark)';

    const initials = operator.name.substring(0, 2).toUpperCase();
    const fallbackToInitials = () => {
        avatar.replaceChildren();
        const fallback = document.createElement('span');
        fallback.style.color = 'var(--text-muted)';
        fallback.style.fontWeight = '600';
        fallback.textContent = initials;
        avatar.appendChild(fallback);
    };

    if (ENABLE_REMOTE_ASSETS) {
        const opImg = document.createElement('img');
        const opBadgeUrl = `https://trackercdn.com/cdn/r6.tracker.network/operators/badges/${slugify(operator.name)}.png`;
        opImg.alt = initials;
        opImg.style.position = 'absolute';
        opImg.style.width = '100%';
        opImg.style.height = '100%';
        opImg.loading = 'lazy';
        opImg.style.objectFit = 'cover';
        opImg.style.transform = 'scale(1.15)';
        opImg.style.opacity = '0.9';
        setImageSourceWithCache(opImg, opBadgeUrl, fallbackToInitials);
        avatar.appendChild(opImg);
    } else {
        fallbackToInitials();
    }

    const nameEl = document.createElement('h3');
    nameEl.style.fontSize = '14px';
    nameEl.style.fontWeight = '600';
    nameEl.style.color = 'var(--text-main)';
    nameEl.textContent = operator.name;

    opInfo.appendChild(avatar);
    opInfo.appendChild(nameEl);

    const favBtn = document.createElement('button');
    favBtn.className = `fav-btn ${isFav ? 'active' : ''}`;
    favBtn.type = 'button';
    favBtn.setAttribute('aria-label', `Toggle favorite for ${operator.name}`);
    favBtn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    const favIcon = document.createElement('span');
    favIcon.className = 'material-icons-outlined';
    favIcon.textContent = isFav ? 'star' : 'star_border';
    favIcon.setAttribute('aria-hidden', 'true');
    favBtn.appendChild(favIcon);
    favBtn.addEventListener('click', () => toggleFavorite(operator.name));

    header.appendChild(opInfo);
    header.appendChild(favBtn);

    const weaponsList = document.createElement('div');
    weaponsList.className = 'weapons-list';
    const weapons = Array.isArray(operator.weapons) ? operator.weapons : [];
    weapons.forEach((weapon) => {
        weaponsList.appendChild(createWeaponButton(operator, weapon));
    });

    groupEl.appendChild(header);
    groupEl.appendChild(weaponsList);
    return groupEl;
}

function getFilteredOperators() {
    const normalized = operatorData
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));

    let filtered = normalized;
    if (currentTab === 'attackers') {
        filtered = filtered.filter((op) => op.role === 'Attacker');
    } else if (currentTab === 'defenders') {
        filtered = filtered.filter((op) => op.role === 'Defender');
    } else if (currentTab === 'favorites') {
        filtered = filtered.filter((op) => favorites.includes(op.name));
    }

    if (searchQuery) {
        filtered = filtered.filter((op) =>
            op.name.toLowerCase().includes(searchQuery)
            || (Array.isArray(op.weapons) && op.weapons.some((weapon) => weapon.name.toLowerCase().includes(searchQuery)))
        );
    }

    if (currentTab !== 'favorites') {
        filtered.sort((a, b) => {
            const aFav = favorites.includes(a.name) ? 1 : 0;
            const bFav = favorites.includes(b.name) ? 1 : 0;
            if (aFav !== bFav) {
                return bFav - aFav;
            }
            return a.name.localeCompare(b.name);
        });
    }

    return filtered;
}

function renderEmptyState(message) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = message;
    grid.appendChild(empty);
}

function scheduleFrame(callback) {
    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(callback);
    } else {
        window.setTimeout(callback, 16);
    }
}

function finishRenderCycle() {
    renderInProgress = false;
    if (renderQueued) {
        renderQueued = false;
        requestRender();
    }
}

function renderGrid() {
    if (!grid) {
        return;
    }

    const currentToken = ++renderToken;
    renderInProgress = true;

    try {
        const filtered = getFilteredOperators();
        grid.replaceChildren();

        if (filtered.length === 0) {
            if (currentToken === renderToken) {
                renderEmptyState('No operators found for the current filters.');
            }
            finishRenderCycle();
            return;
        }

        const chunkSize = 2;
        let index = 0;

        const renderChunk = () => {
            if (currentToken !== renderToken) {
                finishRenderCycle();
                return;
            }

            try {
                const fragment = document.createDocumentFragment();
                const max = Math.min(index + chunkSize, filtered.length);

                while (index < max) {
                    fragment.appendChild(createOperatorCard(filtered[index]));
                    index += 1;
                }

                if (currentToken === renderToken) {
                    grid.appendChild(fragment);
                }

                if (index < filtered.length && currentToken === renderToken) {
                    scheduleFrame(renderChunk);
                    return;
                }
            } catch (err) {
                console.error('[UI Error] renderChunk failed', err);
                if (currentToken === renderToken) {
                    grid.replaceChildren();
                    renderEmptyState('A rendering error occurred. Please switch tabs again.');
                }
            }

            finishRenderCycle();
        };

        scheduleFrame(renderChunk);
    } catch (err) {
        console.error('[UI Error] renderGrid failed', err);
        sendClientEvent('error', 'renderGrid failed', {
            tab: currentTab,
            renderInProgress,
            renderQueued,
        });
        maybeRequestDiagDump('render-grid-failed', {
            tab: currentTab,
            searchLength: searchQuery.length,
        });
        if (currentToken === renderToken) {
            grid.replaceChildren();
            renderEmptyState('A rendering error occurred. Please switch tabs again.');
        }
        finishRenderCycle();
    }
}

function requestRender() {
    if (renderInProgress) {
        renderQueued = true;
        return;
    }

    if (renderScheduled) {
        return;
    }

    renderScheduled = true;
    scheduleFrame(() => {
        renderScheduled = false;
        renderGrid();
    });
}

function initializeUI() {
    sendClientEvent('info', 'ui initialized', { tab: currentTab });
    requestRender();

    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            searchQuery = String(event.target.value || '').toLowerCase();
            requestRender();
        });
    }

    tabBtns.forEach((btn) => {
        btn.addEventListener('click', (event) => {
            const now = Date.now();
            if (now - lastTabSwitchAt < TAB_SWITCH_DEBOUNCE_MS) {
                return;
            }
            lastTabSwitchAt = now;

            const nextTab = String(event.currentTarget.dataset.tab || 'attackers');
            if (nextTab === currentTab && !renderInProgress) {
                return;
            }

            tabBtns.forEach((item) => {
                item.classList.remove('active');
                item.setAttribute('aria-selected', 'false');
            });
            event.currentTarget.classList.add('active');
            event.currentTarget.setAttribute('aria-selected', 'true');
            currentTab = nextTab;
            sendClientEvent('info', 'tab switch', { tab: currentTab });
            requestRender();
        });
    });

    if (intensitySlider) {
        intensitySlider.addEventListener('input', (event) => {
            const safeValue = sendMultiplierToBackend(event.target.value);
            if (selectedOperator && selectedWeapon) {
                setWeaponIntensity(selectedOperator, selectedWeapon, safeValue);
            }
        });
        sendMultiplierToBackend(intensitySlider.value);
    }

    if (dpiInput) {
        dpiInput.value = String(userDpi);
        dpiInput.addEventListener('change', (event) => {
            saveDpi(event.target.value);
            if (selectedOperator && selectedWeapon) {
                selectWeapon(selectedOperator, selectedWeapon);
            }
        });
    }
}

window.addEventListener('error', (event) => {
    console.error('[UI Error] Unhandled error', event.error || event.message);
    sendClientEvent('error', 'Unhandled error', {
        message: String(event.message || ''),
    });
    maybeRequestDiagDump('window-error', {
        message: String(event.message || ''),
    });
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('[UI Error] Unhandled promise rejection', event.reason);
    sendClientEvent('error', 'Unhandled promise rejection', {
        reason: String(event.reason || ''),
    });
    maybeRequestDiagDump('unhandled-rejection', {
        reason: String(event.reason || ''),
    });
});

window.addEventListener('pywebviewready', () => {
    pywebviewReady = true;
    sendClientEvent('info', 'pywebview ready', {});
    fetchAppInfo();
    startDiagnosticHeartbeat();
    startCapsPolling();
    startPerformanceMonitor();
    if (intensitySlider) {
        sendMultiplierToBackend(intensitySlider.value);
    }
});

window.addEventListener('beforeunload', () => {
    stopDiagnosticHeartbeat();
    stopCapsPolling();
    stopPerformanceMonitor();
    pywebviewReady = false;
});

document.addEventListener('DOMContentLoaded', () => {
    initializeUI();
    if (pywebviewReady) {
        fetchAppInfo();
        startCapsPolling();
        startPerformanceMonitor();
    }
});
