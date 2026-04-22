
        // ============================================
        // SUPERAPP - Sistema de Gerenciamento de Apps
        // ============================================
        (function initDarkMode() {
            const stored = localStorage.getItem('superapp-dark-mode');
            const isDark = stored === 'true' || (!stored && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
            const icon = document.getElementById('darkModeIcon');
            if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
            document.getElementById('darkModeToggle')?.addEventListener('click', function () {
                const isDarkNow = document.documentElement.getAttribute('data-theme') === 'dark';
                document.documentElement.setAttribute('data-theme', isDarkNow ? 'light' : 'dark');
                localStorage.setItem('superapp-dark-mode', (!isDarkNow).toString());
                const i = document.getElementById('darkModeIcon');
                if (i) i.className = isDarkNow ? 'fas fa-moon' : 'fas fa-sun';
                document.dispatchEvent(new CustomEvent('superapp:theme-change'));
            });
        })();

        function escapeHtml(s) {
            if (s == null) return '';
            const div = document.createElement('div');
            div.textContent = s;
            return div.innerHTML;
        }

        class SuperApp {
            constructor() {
                this.apps = [];
                this.dashboardProfile = localStorage.getItem('superapp-dashboard-profile') || 'weekly';
                this.dashboardEndpointFilter = localStorage.getItem('superapp-dashboard-endpoint-filter') || 'all';
                this.dashboardHistoryWindow = localStorage.getItem('superapp-dashboard-history-window') || 'all';
                this.statistics = {
                    totalApps: 0,
                    activeApps: 0,
                    betaApps: 0,
                    openApps: 0
                };
                this.dashboardMetrics = {
                    generated_at: null,
                    latest_at: null,
                    summary: { status: 'no_data', uptime_percent: 0, error_rate_percent: 0, p95_latency_ms: 0, checks_total: 0, checks_success: 0, checks_failed: 0, critical_failures: 0 },
                    health: { healthy: 0, attention: 100 },
                    services: { labels: ['Total', 'SaudÃ¡veis', 'Falhas'], values: [0, 0, 0] },
                    latency_current: { labels: [], values: [] },
                    storage_by_app: { labels: [], values: [] },
                    db: { connected: 0, unstable: 100 },
                    failed_endpoints: [],
                    history: []
                };
                this.roadmap = [];
                this.openWindows = new Map();
                this.dashboardCharts = {};
                this.dashboardResizeHandler = null;
                this.vizLibrariesReady = false;
                this.vizLibrariesLoading = null;
                this.notificationItems = [];
                this.notificationTimer = null;
                this.notificationDismissed = { targetDate: '', keys: [] };
                this.NOTIFICATION_DISMISS_KEY = 'superapp_notifications_dismissed_v1';
                this.init();
            }

            async init() {
                this.setupEventListeners();
                await this.ensureVisualizationLibraries();
                this.loadData();
                this.startNotificationCenter();
            }

            loadExternalScript(src) {
                return new Promise((resolve, reject) => {
                    const existing = document.querySelector(`script[data-src="${src}"]`);
                    if (existing) {
                        if (existing.dataset.loaded === 'true') return resolve(true);
                        existing.addEventListener('load', () => resolve(true), { once: true });
                        existing.addEventListener('error', () => reject(new Error(`Falha ao carregar script: ${src}`)), { once: true });
                        return;
                    }
                    const script = document.createElement('script');
                    script.src = src;
                    script.async = false;
                    script.dataset.src = src;
                    script.onload = () => {
                        script.dataset.loaded = 'true';
                        resolve(true);
                    };
                    script.onerror = () => reject(new Error(`Falha ao carregar script: ${src}`));
                    document.head.appendChild(script);
                });
            }

            async ensureVisualizationLibraries() {
                if (this.vizLibrariesReady) return true;
                if (this.vizLibrariesLoading) return this.vizLibrariesLoading;

                this.vizLibrariesLoading = (async () => {
                    const ensureOne = async (globalName, urls) => {
                        if (window[globalName]) return true;
                        for (const url of urls) {
                            try {
                                await this.loadExternalScript(url);
                                if (window[globalName]) return true;
                            } catch (_err) {}
                        }
                        return Boolean(window[globalName]);
                    };

                    const [echartsOk, chartOk] = await Promise.all([
                        ensureOne('echarts', [
                            'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js',
                            'https://unpkg.com/echarts@5.5.0/dist/echarts.min.js'
                        ]),
                        ensureOne('Chart', [
                            'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
                            'https://unpkg.com/chart.js@4.4.1/dist/chart.umd.min.js'
                        ])
                    ]);

                    this.vizLibrariesReady = echartsOk && chartOk;
                    return this.vizLibrariesReady;
                })();

                try {
                    return await this.vizLibrariesLoading;
                } finally {
                    this.vizLibrariesLoading = null;
                }
            }

            setupEventListeners() {
                const navDashboard = document.getElementById('navDashboard');
                const navApps = document.getElementById('navApps');
                const profileSelect = document.getElementById('dashboardProfileSelect');
                const endpointSelect = document.getElementById('dashboardEndpointSelect');
                const historyWindowSelect = document.getElementById('dashboardHistoryWindowSelect');
                if (profileSelect) {
                    profileSelect.value = this.dashboardProfile;
                    profileSelect.addEventListener('change', (e) => {
                        const selected = e.target.value || 'weekly';
                        this.dashboardProfile = selected;
                        localStorage.setItem('superapp-dashboard-profile', selected);
                        this.loadDashboardAnalysis(true);
                    });
                }
                if (endpointSelect) {
                    endpointSelect.value = this.dashboardEndpointFilter;
                    endpointSelect.addEventListener('change', (e) => {
                        this.dashboardEndpointFilter = e.target.value || 'all';
                        localStorage.setItem('superapp-dashboard-endpoint-filter', this.dashboardEndpointFilter);
                        this.renderDashboardCharts();
                        this.renderDashboardInsights();
                    });
                }
                if (historyWindowSelect) {
                    historyWindowSelect.value = this.dashboardHistoryWindow;
                    historyWindowSelect.addEventListener('change', (e) => {
                        this.dashboardHistoryWindow = e.target.value || 'all';
                        localStorage.setItem('superapp-dashboard-history-window', this.dashboardHistoryWindow);
                        this.renderDashboardCharts();
                        this.renderDashboardInsights();
                    });
                }
                if (navDashboard) {
                    navDashboard.addEventListener('click', (e) => {
                        e.preventDefault();
                        document.body.classList.remove('view-apps');
                        document.body.classList.add('view-dashboard');
                        navDashboard.classList.add('active');
                        if (navApps) navApps.classList.remove('active');
                        this.loadDashboardAnalysis(true);
                        setTimeout(() => this.renderDashboardCharts(), 50);
                    });
                }
                if (navApps) {
                    navApps.addEventListener('click', (e) => {
                        e.preventDefault();
                        document.body.classList.remove('view-dashboard');
                        document.body.classList.add('view-apps');
                        navApps.classList.add('active');
                        if (navDashboard) navDashboard.classList.remove('active');
                    });
                }
                document.querySelector('.menu-toggle').addEventListener('click', () => {
                    const nav = document.querySelector('nav');
                    nav.classList.toggle('nav-open');
                });
                document.querySelectorAll('nav a').forEach(link => {
                    link.addEventListener('click', () => {
                        if (window.innerWidth <= 768) document.querySelector('nav').classList.remove('nav-open');
                    });
                });
                document.getElementById('notificationsBtn')?.addEventListener('click', () => {
                    this.openNotificationsModal();
                });
                document.addEventListener('superapp:theme-change', () => {
                    this.renderDashboardCharts();
                });
            }

            // ============================================
            // CARREGAR DADOS DO BACKEND
            // ============================================
            loadData() {
                this.loadApps();
                this.loadStatistics();
                this.loadRoadmap();
                this.loadDashboardAnalysis();
            }

            async loadApps() {
                try {
                    const response = await fetch('/api/apps');
                    if (!response.ok) throw new Error('Falha ao carregar aplicaÃ§Ãµes');
                    const data = await response.json();
                    this.apps = Array.isArray(data) ? data : (data.apps || []);
                    this.renderApps();
                    if (document.getElementById('chartSize')) this.renderDashboardCharts();
                } catch (error) {
                    console.error('Erro ao carregar aplicaÃ§Ãµes:', error);
                    this.apps = [];
                    this.renderApps();
                }
            }

            async loadStatistics() {
                try {
                    const response = await fetch('/api/statistics');
                    if (!response.ok) throw new Error('Falha ao carregar estatÃ­sticas');
                    const data = await response.json();
                    this.statistics = { ...data, openApps: this.openWindows.size };
                    this.renderDashboardCharts();
                } catch (error) {
                    console.error('Erro ao carregar estatÃ­sticas:', error);
                    this.statistics = { totalApps: 0, activeApps: 0, betaApps: 0, openApps: this.openWindows.size };
                    this.renderDashboardCharts();
                }
            }

            async loadRoadmap() {
                try {
                    const response = await fetch('/api/roadmap');
                    if (!response.ok) throw new Error('Falha ao carregar roadmap');
                    const data = await response.json();
                    this.roadmap = Array.isArray(data) ? data : (data.roadmap || []);
                    this.renderRoadmap();
                } catch (error) {
                    console.error('Erro ao carregar roadmap:', error);
                    this.roadmap = [];
                    this.renderRoadmap();
                }
            }

            async loadDashboardAnalysis(forceRefresh = false) {
                try {
                    const profile = this.dashboardProfile || 'weekly';
                    const url = forceRefresh
                        ? `/api/system-analysis-dashboard?profile=${encodeURIComponent(profile)}&t=${Date.now()}`
                        : `/api/system-analysis-dashboard?profile=${encodeURIComponent(profile)}`;
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('Falha ao carregar anÃ¡lise do sistema');
                    const data = await response.json();
                    this.dashboardMetrics = data || this.dashboardMetrics;
                    this.updateDashboardEndpointOptions();
                    this.renderDashboardLastUpdate();
                    this.renderDashboardSummary();
                    this.renderDashboardCharts();
                    this.renderDashboardHealthReport();
                    this.renderDashboardInsights();
                } catch (error) {
                    console.error('Erro ao carregar anÃ¡lise do sistema:', error);
                    this.renderDashboardLastUpdate('Ãšltima anÃ¡lise: sem dados');
                    this.renderDashboardSummary('Sem dados');
                    this.renderDashboardCharts();
                    this.renderDashboardHealthReport('Sem dados de monitoramento no momento.');
                    this.renderDashboardInsights('Sem dados de monitoramento no momento.');
                }
            }

            // ============================================
            // RENDERIZAR COMPONENTES
            // ============================================
            destroyDashboardCharts() {
                Object.values(this.dashboardCharts).forEach(chart => {
                    if (chart && typeof chart.dispose === 'function') chart.dispose();
                    else if (chart && typeof chart.destroy === 'function') chart.destroy();
                });
                this.dashboardCharts = {};
                if (this.dashboardResizeHandler) {
                    window.removeEventListener('resize', this.dashboardResizeHandler);
                    this.dashboardResizeHandler = null;
                }
            }

            renderDashboardCharts() {
                if (typeof echarts === 'undefined') {
                    this.ensureVisualizationLibraries().then(() => this.renderDashboardCharts()).catch(() => {});
                    return;
                }
                this.destroyDashboardCharts();
                const metrics = this.dashboardMetrics || {};
                const health = metrics.health || { healthy: 0, attention: 100 };
                const services = metrics.services || { labels: ['Total', 'Saudaveis', 'Falhas'], values: [0, 0, 0] };
                const latencyCurrent = metrics.latency_current || { labels: [], values: [] };
                const storageByApp = metrics.storage_by_app || { labels: [], values: [] };
                const db = metrics.db || { connected: 0, unstable: 100 };
                const history = Array.isArray(metrics.history) ? metrics.history : [];
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                const filteredLatency = this.getFilteredLatencyData(latencyCurrent);
                const historyWindow = this.getHistoryWindowValue();
                const historyFiltered = historyWindow ? history.slice(-historyWindow) : history;

                const axisTextColor = isDark ? '#cbd5e1' : '#334155';
                const axisLineColor = isDark ? 'rgba(148, 163, 184, 0.24)' : 'rgba(51, 65, 85, 0.16)';
                const tooltipBg = isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(248, 250, 252, 0.96)';
                const seriesBlue = ['#38bdf8', '#2563eb', '#1d4ed8', '#60a5fa', '#93c5fd'];
                const seriesGood = '#22c55e';
                const seriesWarn = '#f59e0b';
                const seriesBad = '#ef4444';

                const baseGrid = { top: 28, left: 18, right: 12, bottom: 22, containLabel: true };
                const baseTooltip = {
                    trigger: 'item',
                    backgroundColor: tooltipBg,
                    borderColor: axisLineColor,
                    textStyle: { color: axisTextColor, fontFamily: 'Space Grotesk, sans-serif' }
                };
                const axisStyle = {
                    axisLine: { lineStyle: { color: axisLineColor } },
                    axisTick: { show: false },
                    axisLabel: { color: axisTextColor, fontSize: 11 },
                    splitLine: { lineStyle: { color: axisLineColor, type: 'dashed' } }
                };

                const createChart = (id, option) => {
                    const el = document.getElementById(id);
                    if (!el) return null;
                    const chart = echarts.init(el, null, { renderer: 'canvas' });
                    chart.setOption(option);
                    this.dashboardCharts[id] = chart;
                    return chart;
                };

                createChart('chartHealth', {
                    color: [seriesGood, seriesWarn],
                    tooltip: baseTooltip,
                    legend: { bottom: 0, textStyle: { color: axisTextColor } },
                    series: [{
                        type: 'pie',
                        radius: ['56%', '82%'],
                        center: ['50%', '44%'],
                        label: {
                            color: axisTextColor,
                            formatter: '{b}\n{d}%',
                            fontSize: 10
                        },
                        labelLine: { lineStyle: { color: axisLineColor } },
                        itemStyle: { borderRadius: 8, borderColor: isDark ? '#0f172a' : '#ffffff', borderWidth: 2 },
                        data: [
                            { value: Number(health.healthy || 0), name: 'Saudavel' },
                            { value: Number(health.attention || 0), name: 'Atencao' }
                        ]
                    }]
                });

                createChart('chartApps', {
                    grid: baseGrid,
                    tooltip: { ...baseTooltip, trigger: 'axis' },
                    xAxis: { type: 'category', data: services.labels || ['Total', 'Saudaveis', 'Falhas'], ...axisStyle },
                    yAxis: { type: 'value', ...axisStyle },
                    series: [{
                        type: 'bar',
                        data: services.values || [0, 0, 0],
                        barWidth: '48%',
                        itemStyle: {
                            borderRadius: [8, 8, 0, 0],
                            color: (params) => [seriesBlue[1], seriesGood, seriesBad][params.dataIndex] || seriesBlue[0]
                        },
                        label: { show: true, position: 'top', color: axisTextColor, fontSize: 11 }
                    }]
                });

                createChart('chartData', {
                    grid: baseGrid,
                    tooltip: { ...baseTooltip, trigger: 'axis' },
                    xAxis: {
                        type: 'category',
                        data: (filteredLatency.labels && filteredLatency.labels.length ? filteredLatency.labels : ['Sem dados']),
                        ...axisStyle
                    },
                    yAxis: { type: 'value', ...axisStyle },
                    series: [{
                        type: 'bar',
                        data: (filteredLatency.values && filteredLatency.values.length ? filteredLatency.values : [0]),
                        barWidth: '58%',
                        itemStyle: {
                            borderRadius: [8, 8, 0, 0],
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: '#38bdf8' },
                                { offset: 1, color: '#1d4ed8' }
                            ])
                        },
                        label: { show: true, position: 'top', formatter: '{c}ms', color: axisTextColor, fontSize: 10 }
                    }]
                });

                createChart('chartSize', {
                    grid: { ...baseGrid, left: 10, right: 18 },
                    tooltip: { ...baseTooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
                    xAxis: { type: 'value', ...axisStyle },
                    yAxis: {
                        type: 'category',
                        data: (storageByApp.labels && storageByApp.labels.length ? storageByApp.labels : ['Sem dados']),
                        ...axisStyle
                    },
                    series: [{
                        type: 'bar',
                        data: (storageByApp.values && storageByApp.values.length ? storageByApp.values : [0]),
                        barWidth: '62%',
                        itemStyle: {
                            borderRadius: [0, 9, 9, 0],
                            color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
                                { offset: 0, color: '#1d4ed8' },
                                { offset: 1, color: '#22d3ee' }
                            ])
                        },
                        label: { show: true, position: 'right', color: axisTextColor, fontSize: 10 }
                    }]
                });

                const dbConnected = Math.max(0, Math.min(100, Number(db.connected || 0)));
                createChart('chartDb', {
                    tooltip: baseTooltip,
                    series: [{
                        type: 'gauge',
                        startAngle: 210,
                        endAngle: -30,
                        min: 0,
                        max: 100,
                        progress: { show: true, width: 12, itemStyle: { color: dbConnected >= 80 ? seriesGood : (dbConnected >= 50 ? seriesWarn : seriesBad) } },
                        axisLine: { lineStyle: { width: 12, color: [[1, isDark ? '#334155' : '#cbd5e1']] } },
                        axisTick: { show: false },
                        splitLine: { show: false },
                        axisLabel: { color: axisTextColor, distance: 12, fontSize: 10 },
                        pointer: { show: false },
                        detail: { valueAnimation: true, formatter: '{value}%', color: axisTextColor, fontSize: 22, offsetCenter: [0, '4%'] },
                        title: { offsetCenter: [0, '64%'], color: axisTextColor, fontSize: 11 },
                        data: [{ value: Math.round(dbConnected), name: 'Conexao DB' }]
                    }]
                });

                const historyLabels = historyFiltered.length
                    ? historyFiltered.map((item) => {
                        const dt = new Date(item.measured_at);
                        return Number.isNaN(dt.getTime()) ? '--' : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    })
                    : ['Sem dados'];
                const latencySeries = historyFiltered.length ? historyFiltered.map((item) => Number(item.p95_latency_ms || 0)) : [0];
                const criticalSeries = historyFiltered.length ? historyFiltered.map((item) => Number(item.critical_failures || 0)) : [0];
                createChart('chartHistory', {
                    legend: { bottom: 0, textStyle: { color: axisTextColor } },
                    tooltip: { ...baseTooltip, trigger: 'axis' },
                    grid: { ...baseGrid, bottom: 36 },
                    xAxis: { type: 'category', data: historyLabels, ...axisStyle },
                    yAxis: [
                        { type: 'value', name: 'ms', ...axisStyle },
                        { type: 'value', name: 'falhas', ...axisStyle, splitLine: { show: false } }
                    ],
                    series: [
                        {
                            name: 'p95 (ms)',
                            type: 'line',
                            smooth: true,
                            symbol: 'circle',
                            symbolSize: 7,
                            itemStyle: { color: seriesBlue[0] },
                            areaStyle: {
                                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                    { offset: 0, color: 'rgba(56, 189, 248, 0.34)' },
                                    { offset: 1, color: 'rgba(56, 189, 248, 0.02)' }
                                ])
                            },
                            data: latencySeries
                        },
                        {
                            name: 'Falhas criticas',
                            type: 'bar',
                            yAxisIndex: 1,
                            barMaxWidth: 16,
                            itemStyle: { color: seriesBad, borderRadius: [6, 6, 0, 0] },
                            data: criticalSeries
                        }
                    ],
                    dataZoom: historyLabels.length > 12 ? [
                        { type: 'inside', start: 45, end: 100 },
                        { type: 'slider', height: 14, bottom: 2, borderColor: axisLineColor, textStyle: { color: axisTextColor } }
                    ] : []
                });

                this.dashboardResizeHandler = () => {
                    Object.values(this.dashboardCharts).forEach(chart => {
                        if (chart && typeof chart.resize === 'function') chart.resize();
                    });
                };
                window.addEventListener('resize', this.dashboardResizeHandler, { passive: true });

                const cards = document.querySelectorAll('.dashboard-chart-card');
                cards.forEach((card, index) => {
                    card.animate(
                        [
                            { transform: 'translateY(18px)', opacity: 0 },
                            { transform: 'translateY(0)', opacity: 1 }
                        ],
                        { duration: 460, delay: index * 55, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }
                    );
                });
            }

            getHistoryWindowValue() {
                const n = Number(this.dashboardHistoryWindow || 0);
                if (!Number.isFinite(n) || n <= 0) return null;
                return Math.round(n);
            }

            getFilteredLatencyData(latencyCurrent) {
                const labels = Array.isArray(latencyCurrent?.labels) ? latencyCurrent.labels : [];
                const values = Array.isArray(latencyCurrent?.values) ? latencyCurrent.values : [];
                if (this.dashboardEndpointFilter === 'all') {
                    return {
                        labels: labels.length ? labels : ['Sem dados'],
                        values: values.length ? values : [0]
                    };
                }
                const idx = labels.findIndex((label) => String(label).toLowerCase() === String(this.dashboardEndpointFilter).toLowerCase());
                if (idx < 0) return { labels: ['Sem dados'], values: [0] };
                return { labels: [labels[idx]], values: [Number(values[idx] || 0)] };
            }

            updateDashboardEndpointOptions() {
                const select = document.getElementById('dashboardEndpointSelect');
                if (!select) return;
                const latencyCurrent = this.dashboardMetrics?.latency_current || { labels: [] };
                const labels = Array.isArray(latencyCurrent.labels) ? latencyCurrent.labels : [];
                const previous = this.dashboardEndpointFilter || 'all';
                const options = ['all', ...labels];
                select.innerHTML = options.map((value) => {
                    const text = value === 'all' ? 'Todos' : value;
                    return `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`;
                }).join('');
                const hasPrev = options.some((value) => String(value).toLowerCase() === String(previous).toLowerCase());
                this.dashboardEndpointFilter = hasPrev ? previous : 'all';
                select.value = this.dashboardEndpointFilter;
                localStorage.setItem('superapp-dashboard-endpoint-filter', this.dashboardEndpointFilter);
            }

            renderDashboardLastUpdate(fallbackText = null) {
                const el = document.getElementById('dashboardLastUpdate');
                if (!el) return;
                const profileMap = { weekly: 'Semanal', monthly: 'Mensal', total: 'Total' };
                const profileLabel = profileMap[this.dashboardProfile] || 'Semanal';
                if (fallbackText) {
                    el.textContent = `${fallbackText} (${profileLabel})`;
                    return;
                }
                const latestAt = this.dashboardMetrics?.latest_at;
                if (!latestAt) {
                    el.textContent = `Ãšltima anÃ¡lise: sem dados (${profileLabel})`;
                    return;
                }
                const dt = new Date(latestAt);
                if (Number.isNaN(dt.getTime())) {
                    el.textContent = `Ãšltima anÃ¡lise: sem dados (${profileLabel})`;
                    return;
                }
                el.textContent = `Ãšltima anÃ¡lise: ${dt.toLocaleString('pt-BR')} (${profileLabel})`;
            }

            renderDashboardSummary(fallbackText = null) {
                const root = document.getElementById('dashboardSummary');
                if (!root) return;

                if (fallbackText) {
                    root.innerHTML = Array.from({ length: 3 }).map(() => `
                        <div class="dashboard-summary-card">
                            <span class="dashboard-summary-label">Monitor</span>
                            <strong class="dashboard-summary-value">--</strong>
                            <span class="dashboard-summary-meta">${escapeHtml(fallbackText)}</span>
                        </div>
                    `).join('');
                    return;
                }

                const metrics = this.dashboardMetrics || {};
                const summary = metrics.summary || {};
                const checksTotal = Number(summary.checks_total || 0);
                const checksSuccess = Number(summary.checks_success || 0);
                const checksFailed = Number(summary.checks_failed || 0);
                const criticalFailures = Number(summary.critical_failures || 0);
                const uptime = Number(summary.uptime_percent || 0);
                const status = String(summary.status || 'no_data').toLowerCase();
                const statusMap = {
                    healthy: { label: 'SaudÃ¡vel', className: 'is-ok' },
                    attention: { label: 'AtenÃ§Ã£o', className: criticalFailures > 0 ? 'is-bad' : 'is-warn' },
                    no_data: { label: 'Sem dados', className: 'is-warn' }
                };
                const statusView = statusMap[status] || { label: 'Indefinido', className: 'is-warn' };

                root.innerHTML = `
                    <div class="dashboard-summary-card">
                        <span class="dashboard-summary-label">Status Geral</span>
                        <strong class="dashboard-summary-value ${statusView.className}">${escapeHtml(statusView.label)}</strong>
                        <span class="dashboard-summary-meta">${uptime.toFixed(2)}% de uptime</span>
                    </div>
                    <div class="dashboard-summary-card">
                        <span class="dashboard-summary-label">Cobertura do Xerife</span>
                        <strong class="dashboard-summary-value ${checksFailed > 0 ? 'is-warn' : 'is-ok'}">${checksSuccess}/${checksTotal}</strong>
                        <span class="dashboard-summary-meta">${checksFailed} check(s) com falha</span>
                    </div>
                    <div class="dashboard-summary-card">
                        <span class="dashboard-summary-label">Falhas CrÃ­ticas</span>
                        <strong class="dashboard-summary-value ${criticalFailures > 0 ? 'is-bad' : 'is-ok'}">${criticalFailures}</strong>
                        <span class="dashboard-summary-meta">Pontos vitais fora do ar</span>
                    </div>
                `;
            }

            renderDashboardHealthReport(fallbackText = null) {
                const root = document.getElementById('dashboardHealthReport');
                if (!root) return;
                const body = root.querySelector('.dashboard-health-report-body');
                if (!body) return;

                if (fallbackText) {
                    body.innerHTML = `<p>${escapeHtml(fallbackText)}</p>`;
                    return;
                }

                const metrics = this.dashboardMetrics || {};
                const summary = metrics.summary || {};
                const services = metrics.services || {};
                const latencyCurrent = metrics.latency_current || { labels: [], values: [] };
                const db = metrics.db || {};
                const failedEndpoints = Array.isArray(metrics.failed_endpoints) ? metrics.failed_endpoints : [];

                const status = String(summary.status || 'no_data').toLowerCase();
                const statusLabel = status === 'healthy' ? 'SaudÃ¡vel' : (status === 'attention' ? 'AtenÃ§Ã£o' : 'Sem dados');
                const checksTotal = Number(summary.checks_total || services.values?.[0] || 0);
                const checksOk = Number(summary.checks_success || services.values?.[1] || 0);
                const checksFail = Number(summary.checks_failed || services.values?.[2] || 0);
                const criticalFailures = Number(summary.critical_failures || 0);
                const uptime = Number(summary.uptime_percent || 0);
                const errorRate = Number(summary.error_rate_percent || 0);
                const p95 = Number(summary.p95_latency_ms || 0);
                const dbConnected = Number(db.connected || 0);

                let slowLabel = 'sem dados';
                let slowValue = 0;
                const labels = Array.isArray(latencyCurrent.labels) ? latencyCurrent.labels : [];
                const values = Array.isArray(latencyCurrent.values) ? latencyCurrent.values : [];
                values.forEach((v, i) => {
                    const n = Number(v || 0);
                    if (n >= slowValue) {
                        slowValue = n;
                        slowLabel = String(labels[i] || `endpoint ${i + 1}`);
                    }
                });

                const latestAt = metrics.latest_at ? new Date(metrics.latest_at) : null;
                const latestText = latestAt && !Number.isNaN(latestAt.getTime())
                    ? latestAt.toLocaleString('pt-BR')
                    : 'sem horario valido';
                const statusChipClass = status === 'healthy' ? 'ok' : (criticalFailures > 0 ? 'bad' : 'warn');
                const failuresHtml = failedEndpoints.length
                    ? failedEndpoints.slice(0, 6).map((item) => `
                        <div class="dashboard-health-list-item">
                            <strong>${escapeHtml(item.endpoint_name || 'endpoint')}</strong>
                            <span>Status: ${escapeHtml(String(item.status_code ?? 'sem status'))} | CrÃ­tico: ${item.critical ? 'sim' : 'nÃ£o'}</span>
                            <span>${escapeHtml(item.error_message || 'Falha sem detalhe')}</span>
                        </div>
                    `).join('')
                    : `<div class="dashboard-empty-note">Nenhuma falha detectada no ultimo snapshot.</div>`;

                body.innerHTML = `
                    <div class="dashboard-health-status-row">
                        <span class="dashboard-status-chip ${statusChipClass}"><i class="fas fa-shield-halved"></i>${escapeHtml(statusLabel)}</span>
                        <span class="dashboard-status-chip ${criticalFailures > 0 ? 'bad' : 'ok'}"><i class="fas fa-triangle-exclamation"></i>${criticalFailures} falha(s) crÃ­tica(s)</span>
                    </div>
                    <div class="dashboard-health-grid">
                        <div class="dashboard-health-panel">
                            <h5>Resumo Executivo</h5>
                            <p><strong>Status geral:</strong> ${escapeHtml(statusLabel)}. ${checksOk}/${checksTotal} checks passaram e ${checksFail} falharam.</p>
                            <p><strong>Confiabilidade:</strong> uptime ${uptime.toFixed(2)}% | taxa de erro ${errorRate.toFixed(2)}% | p95 ${Math.round(p95)}ms.</p>
                            <p><strong>Ponto de atenÃ§Ã£o:</strong> endpoint mais lento recente: ${escapeHtml(slowLabel)} (${Math.round(slowValue)}ms).</p>
                            <p><strong>Banco:</strong> conexÃ£o com DB em ${dbConnected.toFixed(2)}%.</p>
                            <p><strong>Ãšltima amostra:</strong> ${escapeHtml(latestText)}.</p>
                        </div>
                        <div class="dashboard-health-panel" style="grid-column: 1 / -1;">
                            <h5>Falhas do Ãšltimo Snapshot</h5>
                            <div class="dashboard-health-list">${failuresHtml}</div>
                        </div>
                    </div>
                `;
            }

            renderDashboardInsights(fallbackText = null) {
                const root = document.getElementById('dashboardInsights');
                if (!root) return;
                if (fallbackText) {
                    root.innerHTML = `
                        <article class="dashboard-insight-card warn">
                            <h5>Insights</h5>
                            <strong>Sem dados</strong>
                            <p>${escapeHtml(fallbackText)}</p>
                        </article>
                    `;
                    return;
                }

                const metrics = this.dashboardMetrics || {};
                const summary = metrics.summary || {};
                const latencyCurrent = this.getFilteredLatencyData(metrics.latency_current || { labels: [], values: [] });
                const failedEndpoints = Array.isArray(metrics.failed_endpoints) ? metrics.failed_endpoints : [];
                const db = metrics.db || {};
                const history = Array.isArray(metrics.history) ? metrics.history : [];
                const historyWindow = this.getHistoryWindowValue();
                const historyFiltered = historyWindow ? history.slice(-historyWindow) : history;

                const uptime = Number(summary.uptime_percent || 0);
                const errorRate = Number(summary.error_rate_percent || 0);
                const dbConnected = Number(db.connected || 0);
                const criticalFailures = Number(summary.critical_failures || 0);
                const latencyValues = Array.isArray(latencyCurrent.values) ? latencyCurrent.values.map((v) => Number(v || 0)) : [0];
                const latencyPeak = latencyValues.length ? Math.max(...latencyValues) : 0;
                const latencyAvg = latencyValues.length ? latencyValues.reduce((acc, cur) => acc + cur, 0) / latencyValues.length : 0;
                const latestHistory = historyFiltered.length ? historyFiltered[historyFiltered.length - 1] : null;
                const prevHistory = historyFiltered.length > 1 ? historyFiltered[historyFiltered.length - 2] : null;
                const trend = (latestHistory && prevHistory)
                    ? Number(latestHistory.p95_latency_ms || 0) - Number(prevHistory.p95_latency_ms || 0)
                    : 0;

                root.innerHTML = `
                    <article class="dashboard-insight-card ${criticalFailures > 0 ? 'bad' : 'good'}">
                        <h5>Confiabilidade</h5>
                        <strong>${uptime.toFixed(2)}% uptime</strong>
                        <p>Taxa de erro atual: ${errorRate.toFixed(2)}%.</p>
                    </article>
                    <article class="dashboard-insight-card ${latencyPeak > 900 ? 'bad' : (latencyPeak > 450 ? 'warn' : 'good')}">
                        <h5>LatÃªncia</h5>
                        <strong>Pico ${Math.round(latencyPeak)}ms</strong>
                        <p>MÃ©dia filtrada: ${Math.round(latencyAvg)}ms (${latencyCurrent.labels.length} endpoint(s)).</p>
                    </article>
                    <article class="dashboard-insight-card ${dbConnected < 85 ? 'warn' : 'good'}">
                        <h5>Banco de Dados</h5>
                        <strong>${dbConnected.toFixed(2)}% conectado</strong>
                        <p>${dbConnected < 85 ? 'Instabilidade detectada no DB.' : 'Conectividade saudÃ¡vel no DB.'}</p>
                    </article>
                    <article class="dashboard-insight-card ${failedEndpoints.length ? 'bad' : 'good'}">
                        <h5>Anomalias</h5>
                        <strong>${failedEndpoints.length} endpoint(s) falho(s)</strong>
                        <p>${failedEndpoints.length ? `Principal: ${escapeHtml(String(failedEndpoints[0]?.endpoint_name || 'desconhecido'))}.` : 'Nenhuma falha no Ãºltimo snapshot.'}</p>
                    </article>
                    <article class="dashboard-insight-card ${trend > 50 ? 'warn' : 'good'}">
                        <h5>TendÃªncia de p95</h5>
                        <strong>${trend >= 0 ? '+' : ''}${Math.round(trend)}ms</strong>
                        <p>${historyWindow ? `Comparando os Ãºltimos ${historyWindow} pontos.` : 'Comparando janela completa disponÃ­vel.'}</p>
                    </article>
                `;
            }

            renderApps() {
                const container = document.getElementById('appsContainer');

                if (this.apps.length === 0) {
                    container.innerHTML = `
                        <div class="empty-state">
                            <div>
                                <div class="empty-state-icon">
                                    <i class="fas fa-inbox"></i>
                                </div>
                                <p class="empty-state-text">Nenhuma aplicaÃ§Ã£o disponÃ­vel</p>
                                <p class="mt-2" style="font-size: 0.875rem; color: #9ca3af;">As aplicaÃ§Ãµes serÃ£o carregadas do backend</p>
                            </div>
                        </div>
                    `;
                    return;
                }

                container.innerHTML = this.apps.map((app, idx) => `
                    <div class="app-card" data-tone="${this.getAppTone(app, idx)}" style="--card-i:${idx};" onclick="superApp.launchApp('${app.id}')">
                        <div class="app-header">
                            <div class="app-icon-wrap">
                                <div class="app-icon-box">
                                    <span class="app-emoji" aria-hidden="true">${this.getAppEmoji(app)}</span>
                                    <i class="fas ${app.icon} app-icon-glyph" aria-hidden="true"></i>
                                </div>
                                <span class="app-emoji-orbit" aria-hidden="true">${this.getAppOrbitEmoji(app)}</span>
                            </div>
                        </div>
                        <span class="app-title">${escapeHtml(app.title || 'Aplicacao')}</span>
                        <div class="app-meta-row">
                            <span class="app-chip">${escapeHtml(this.getAppCategoryLabel(app))}</span>
                            <span class="app-chip app-chip--status">${escapeHtml(this.getAppStatusLabel(app))}</span>
                        </div>
                        <p class="app-desc">${escapeHtml(this.getAppPreviewDescription(app))}</p>
                        <span class="app-open-hint">Abrir modulo <i class="fas fa-arrow-right"></i></span>
                    </div>
                `).join('');
                this.animateAppCards();
            }

            getAppTone(app, idx = 0) {
                const id = String(app?.id || '').toLowerCase();
                if (id.includes('fin') || id.includes('despesa')) return 'warm';
                if (id.includes('saude') || id.includes('treino')) return 'growth';
                if (id.includes('flux')) return 'energy';
                return ['cool', 'growth', 'warm', 'energy'][idx % 4];
            }

            getAppEmoji(app) {
                const id = String(app?.id || '').toLowerCase();
                const title = String(app?.title || '').toLowerCase();
                if (id.includes('fin') || title.includes('finan')) return 'ðŸ’°';
                if (id.includes('despesa')) return 'ðŸ§¾';
                if (id.includes('lista') || title.includes('compra')) return 'ðŸ›’';
                if (id.includes('saude') || title.includes('saÃºde')) return 'ðŸ©º';
                if (id.includes('calend') || title.includes('agenda')) return 'ðŸ“…';
                if (id.includes('flux')) return 'ðŸ§ ';
                if (id.includes('treino') || title.includes('miss')) return 'ðŸ”¥';
                if (id.includes('roadmap')) return 'ðŸ—ºï¸';
                return 'ðŸš€';
            }

            getAppOrbitEmoji(app) {
                const id = String(app?.id || '').toLowerCase();
                if (id.includes('fin') || id.includes('despesa')) return 'âœ¨';
                if (id.includes('saude') || id.includes('treino')) return 'âš¡';
                if (id.includes('flux')) return 'ðŸ’«';
                if (id.includes('lista')) return 'âœ…';
                if (id.includes('calend')) return 'ðŸ””';
                return 'âœ¦';
            }

            getMotionHelpers() {
                const root = window.motion || window.Motion || null;
                if (!root || typeof root.animate !== 'function') return null;
                return {
                    animate: root.animate.bind(root),
                    stagger: typeof root.stagger === 'function' ? root.stagger.bind(root) : null
                };
            }

            getAppCategoryLabel(app) {
                const category = String(app?.category || '').trim();
                if (!category) return 'Geral';
                return category;
            }

            getAppStatusLabel(app) {
                const status = String(app?.status || '').toLowerCase();
                if (status === 'beta') return 'Beta';
                if (status === 'open') return 'Aberto';
                if (status === 'maintenance') return 'Manutencao';
                return 'Ativo';
            }

            getAppPreviewDescription(app) {
                const text = String(app?.description || '').replace(/\s+/g, ' ').trim();
                if (!text) return 'Modulo pronto para uso no ecossistema do SUPERAPP.';
                if (text.length <= 104) return text;
                return `${text.slice(0, 101).trim()}...`;
            }

            animateAppCards() {
                const helpers = this.getMotionHelpers();
                const cards = document.querySelectorAll('#appsContainer .app-card');
                if (!cards.length) return;
                if (!helpers) return;
                const delayPattern = helpers.stagger ? helpers.stagger(0.04) : 0;
                helpers.animate(
                    cards,
                    { opacity: [0, 1], y: [18, 0], scale: [0.97, 1], filter: ['blur(2px)', 'blur(0px)'] },
                    { duration: 0.55, delay: delayPattern, easing: 'cubic-bezier(.2,.8,.2,1)' }
                );
                cards.forEach((card) => {
                    const emoji = card.querySelector('.app-emoji');
                    if (!emoji) return;
                    helpers.animate(
                        emoji,
                        { y: [0, -3, 0], rotate: [-2, 2, -2] },
                        { duration: 2.2, repeat: Infinity, easing: 'ease-in-out' }
                    );
                    const details = card.querySelectorAll('.app-title, .app-meta-row, .app-desc, .app-open-hint');
                    if (details.length) {
                        const detailsDelay = helpers.stagger ? helpers.stagger(0.03, { startDelay: 0.08 }) : 0.12;
                        helpers.animate(
                            details,
                            { opacity: [0, 1], y: [8, 0] },
                            { duration: 0.36, delay: detailsDelay, easing: 'ease-out' }
                        );
                    }
                });
            }

            renderRoadmap() {
                const container = document.getElementById('roadmapContainer');
                if (!container) return;

                if (this.roadmap.length === 0) {
                    container.innerHTML = `
                        <div class="roadmap-empty">
                            <div>
                                <div class="roadmap-empty-icon">
                                    <i class="fas fa-map"></i>
                                </div>
                                <p class="roadmap-empty-text">Roadmap nÃ£o carregado</p>
                                <p class="mt-2" style="font-size: 0.875rem; color: #bfdbfe;">O roadmap serÃ¡ carregado do backend</p>
                            </div>
                        </div>
                    `;
                    return;
                }

                container.innerHTML = this.roadmap.map(item => `
                    <div class="timeline-item">
                        <div class="timeline-indicator">${item.step}</div>
                        <div class="timeline-content">
                            <h4>${item.title}</h4>
                            <p>${item.description}</p>
                        </div>
                    </div>
                `).join('');
            }

            // ============================================
            // DIÃLOGOS DE CONFIRMAÃ‡ÃƒO PERSONALIZADOS
            // ============================================
            async showConfirm(title, message) {
                return new Promise((resolve) => {
                    const overlay = document.createElement('div');
                    overlay.className = 'app-confirm-overlay';
                    overlay.innerHTML = `
                        <div class="app-confirm-modal">
                            <h4><i class="fas fa-exclamation-triangle" style="color:#ef4444"></i> ${escapeHtml(title)}</h4>
                            <p>${escapeHtml(message)}</p>
                            <div class="app-confirm-actions">
                                <button type="button" class="app-confirm-btn cancel">Cancelar</button>
                                <button type="button" class="app-confirm-btn confirm">Confirmar</button>
                            </div>
                        </div>
                    `;

                    const cleanup = (result) => {
                        overlay.remove();
                        resolve(result);
                    };

                    overlay.querySelector('.cancel').onclick = () => cleanup(false);
                    overlay.querySelector('.confirm').onclick = () => cleanup(true);
                    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };

                    document.body.appendChild(overlay);
                });
            }

            formatMesAnoLabel(mesAno) {
                const s = String(mesAno || '');
                const m = s.match(/^(\d{4})-(\d{2})$/);
                if (!m) return s;
                return `${m[2]}/${m[1]}`;
            }

            formatMoneyBr(value) {
                return `R$ ${Number(value || 0).toFixed(2)}`;
            }

            getChartThemeTokens(forceDark = null) {
                const isDark = forceDark === null
                    ? document.documentElement.getAttribute('data-theme') === 'dark'
                    : Boolean(forceDark);
                return {
                    isDark,
                    text: isDark ? '#e2ecff' : '#0f172a',
                    textMuted: isDark ? '#94a3b8' : '#475569',
                    grid: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(51,65,85,0.16)',
                    tooltipBg: isDark ? 'rgba(10,20,38,0.92)' : 'rgba(248,250,252,0.96)',
                    tooltipBorder: isDark ? 'rgba(89,132,194,0.35)' : 'rgba(148,163,184,0.4)',
                };
            }

            getModernChartBaseOptions({ indexAxis = 'x', legend = true, forceDark = null } = {}) {
                const theme = this.getChartThemeTokens(forceDark);
                const baseAxis = {
                    ticks: { color: theme.textMuted, font: { family: 'Space Grotesk, sans-serif', size: 11 } },
                    grid: { color: theme.grid, drawBorder: false },
                    border: { display: false },
                };
                return {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis,
                    animation: { duration: 620, easing: 'easeOutQuart' },
                    layout: { padding: { top: 10, right: 28, bottom: 4, left: 8 } },
                    plugins: {
                        legend: {
                            display: legend,
                            position: 'bottom',
                            labels: {
                                color: theme.text,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                boxWidth: 10,
                                padding: 12,
                                font: { family: 'Space Grotesk, sans-serif', size: 11, weight: 600 }
                            }
                        },
                        tooltip: {
                            backgroundColor: theme.tooltipBg,
                            borderColor: theme.tooltipBorder,
                            borderWidth: 1,
                            titleColor: theme.text,
                            bodyColor: theme.text,
                            titleFont: { family: 'Space Grotesk, sans-serif', size: 12, weight: 700 },
                            bodyFont: { family: 'Space Grotesk, sans-serif', size: 11, weight: 500 },
                            padding: 10,
                            displayColors: true
                        }
                    },
                    scales: {
                        x: { ...baseAxis, beginAtZero: indexAxis === 'y' },
                        y: { ...baseAxis, beginAtZero: indexAxis !== 'y' }
                    }
                };
            }

            mergeChartOptions(baseOptions = {}, incomingOptions = {}) {
                const merged = { ...baseOptions, ...incomingOptions };
                const basePlugins = baseOptions.plugins || {};
                const incomingPlugins = incomingOptions.plugins || {};
                merged.plugins = {
                    ...basePlugins,
                    ...incomingPlugins,
                    legend: { ...(basePlugins.legend || {}), ...(incomingPlugins.legend || {}) },
                    tooltip: { ...(basePlugins.tooltip || {}), ...(incomingPlugins.tooltip || {}) },
                };
                const baseScales = baseOptions.scales || {};
                const incomingScales = incomingOptions.scales || {};
                merged.scales = { ...baseScales, ...incomingScales };
                ['x', 'y', 'y1'].forEach((axis) => {
                    if (baseScales[axis] || incomingScales[axis]) {
                        merged.scales[axis] = { ...(baseScales[axis] || {}), ...(incomingScales[axis] || {}) };
                    }
                });
                return merged;
            }

            buildInlineChartValuePlugin({ asMoney = false, forceDark = null } = {}) {
                const pluginId = `modernInlineValueLabels-${asMoney ? 'money' : 'plain'}-${forceDark === null ? 'auto' : (forceDark ? 'dark' : 'light')}`;
                return {
                    id: pluginId,
                    afterDatasetsDraw: (chart) => {
                        const dataset = chart?.data?.datasets?.[0];
                        const meta = chart?.getDatasetMeta?.(0);
                        if (!dataset || !meta?.data?.length) return;
                        const theme = this.getChartThemeTokens(forceDark);
                        const ctx = chart.ctx;
                        ctx.save();
                        ctx.font = '600 11px Space Grotesk, sans-serif';
                        ctx.fillStyle = theme.text;
                        ctx.textBaseline = 'middle';
                        const chartArea = chart.chartArea || {};
                        const areaLeft = Number.isFinite(chartArea.left) ? chartArea.left : 0;
                        const areaRight = Number.isFinite(chartArea.right) ? chartArea.right : chart.width;
                        const areaTop = Number.isFinite(chartArea.top) ? chartArea.top : 0;
                        meta.data.forEach((element, index) => {
                            const raw = Number(dataset.data?.[index] ?? 0);
                            if (!Number.isFinite(raw) || raw <= 0) return;
                            const label = asMoney ? this.formatMoneyBr(raw) : `${Math.round(raw)}`;
                            const pos = element.tooltipPosition();
                            const labelWidth = ctx.measureText(label).width;
                            if (chart.config.type === 'bar') {
                                const isHorizontal = chart.options?.indexAxis === 'y';
                                if (isHorizontal) {
                                    ctx.textAlign = 'left';
                                    const rightLimit = areaRight - labelWidth - 4;
                                    const leftLimit = areaLeft + 4;
                                    const x = Math.max(leftLimit, Math.min(pos.x + 8, rightLimit));
                                    const y = pos.y;
                                    ctx.fillText(label, x, y);
                                    return;
                                }
                                ctx.textAlign = 'center';
                                const x = Math.max(areaLeft + (labelWidth / 2) + 2, Math.min(pos.x, areaRight - (labelWidth / 2) - 2));
                                const y = Math.max(areaTop + 8, pos.y - 10);
                                ctx.fillText(label, x, y);
                            } else {
                                ctx.textAlign = 'center';
                                ctx.fillText(label, pos.x, pos.y);
                            }
                        });
                        ctx.restore();
                    }
                };
            }

            downloadHtmlReport(filenameBase, htmlContent) {
                const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${filenameBase}.html`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            }

            async renderChartImageDataUrl(config, width = 1000, height = 420) {
                if (typeof Chart === 'undefined') return '';
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return '';
                const chartType = String(config?.type || 'bar').toLowerCase();
                const incomingOptions = config?.options || {};
                const incomingPlugins = Array.isArray(config?.plugins) ? config.plugins : [];
                const baseOptions = this.getModernChartBaseOptions({
                    indexAxis: incomingOptions.indexAxis || 'x',
                    legend: chartType !== 'bar',
                    forceDark: true
                });
                const finalConfig = {
                    ...config,
                    options: this.mergeChartOptions(
                        {
                            ...baseOptions,
                            responsive: false,
                            maintainAspectRatio: false,
                            animation: false,
                            devicePixelRatio: 2
                        },
                        incomingOptions
                    ),
                    plugins: [...incomingPlugins, this.buildInlineChartValuePlugin({ asMoney: false, forceDark: true })]
                };
                const chart = new Chart(ctx, finalConfig);
                await new Promise((resolve) => requestAnimationFrame(resolve));
                const dataUrl = canvas.toDataURL('image/png');
                chart.destroy();
                return dataUrl;
            }

            buildReportHtml({ title, subtitle, summaryRows = [], chartSections = [], tableHeaders = [], tableRows = [] }) {
                const summaryHtml = summaryRows.map((row) => `
                    <div class="summary-card">
                        <div class="summary-label">${escapeHtml(row.label || '')}</div>
                        <div class="summary-value">${escapeHtml(String(row.value || ''))}</div>
                    </div>
                `).join('');
                const chartsHtml = chartSections.map((section) => `
                    <section class="section">
                        <h3>${escapeHtml(section.title || '')}</h3>
                        ${section.img ? `<img src="${section.img}" alt="${escapeHtml(section.title || 'GrÃ¡fico')}" />` : '<p>Sem dados para grÃ¡fico neste mÃªs.</p>'}
                    </section>
                `).join('');
                const tableHead = tableHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
                const tableBody = tableRows.length
                    ? tableRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? ''))}</td>`).join('')}</tr>`).join('')
                    : `<tr><td colspan="${Math.max(1, tableHeaders.length)}">Sem dados no perÃ­odo.</td></tr>`;

                return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root{
      --bg:#050b17;
      --bg-soft:#0b1528;
      --card:#0f1b31cc;
      --card-solid:#0f1b31;
      --line:#233556;
      --text:#e6eefc;
      --muted:#9fb1d1;
      --accent:#38bdf8;
      --accent-soft:#0ea5e9;
      --good:#22c55e;
      --warn:#f59e0b;
      --shadow:0 20px 40px rgba(2,8,23,.45);
    }
    @media (prefers-color-scheme: light){
      :root{
        --bg:#edf3ff;
        --bg-soft:#dfe9ff;
        --card:#ffffffde;
        --card-solid:#ffffff;
        --line:#d6e0f2;
        --text:#0f172a;
        --muted:#5b6b86;
        --accent:#0ea5e9;
        --accent-soft:#0284c7;
        --good:#16a34a;
        --warn:#d97706;
        --shadow:0 18px 34px rgba(15,23,42,.12);
      }
    }
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{
      font-family:'Space Grotesk','Segoe UI',sans-serif;
      color:var(--text);
      background:
        radial-gradient(1000px 500px at 10% -10%, rgba(56,189,248,.16), transparent 65%),
        radial-gradient(900px 500px at 90% -5%, rgba(34,197,94,.12), transparent 60%),
        linear-gradient(180deg,var(--bg),var(--bg-soft));
      min-height:100vh;
      padding:24px;
    }
    .wrap{max-width:1160px;margin:0 auto}
    .hero{
      background:linear-gradient(135deg,rgba(56,189,248,.12),rgba(14,165,233,.04) 45%,rgba(34,197,94,.08));
      border:1px solid var(--line);
      border-radius:18px;
      padding:18px 18px 14px;
      box-shadow:var(--shadow);
      backdrop-filter:blur(6px);
    }
    h1{margin:0;font-size:26px;letter-spacing:.2px}
    .subtitle{color:var(--muted);margin-top:6px}
    .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    .chip{
      border:1px solid var(--line);
      background:var(--card-solid);
      color:var(--muted);
      border-radius:999px;
      padding:6px 10px;
      font-size:12px;
    }
    .summary{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
      gap:10px;
      margin:14px 0 0;
    }
    .summary-card{
      background:var(--card);
      border:1px solid var(--line);
      border-radius:14px;
      padding:12px;
      box-shadow:0 6px 18px rgba(2,8,23,.15);
    }
    .summary-label{font-size:12px;color:var(--muted)}
    .summary-value{font-size:20px;font-weight:700;margin-top:2px}
    .section{
      background:var(--card);
      border:1px solid var(--line);
      border-radius:16px;
      padding:14px;
      margin-top:14px;
      box-shadow:0 10px 22px rgba(2,8,23,.2);
    }
    .section h3{
      margin:0 0 10px;
      font-size:15px;
      color:var(--accent);
      letter-spacing:.3px;
    }
    img{
      width:100%;
      height:auto;
      border:1px solid var(--line);
      border-radius:12px;
      background:#fff;
    }
    .table-wrap{
      border:1px solid var(--line);
      border-radius:12px;
      overflow:auto;
      background:var(--card-solid);
    }
    table{width:100%;border-collapse:collapse;min-width:680px}
    th,td{
      border-bottom:1px solid var(--line);
      padding:10px 12px;
      text-align:left;
      font-size:13px;
      vertical-align:top;
    }
    th{
      position:sticky;
      top:0;
      background:linear-gradient(180deg,rgba(56,189,248,.16),rgba(56,189,248,.06));
      color:var(--text);
      font-weight:600;
    }
    tr:nth-child(even) td{background:rgba(148,163,184,.06)}
    .foot{
      margin-top:14px;
      color:var(--muted);
      font-size:12px;
      text-align:right;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <h1>${escapeHtml(title)}</h1>
      <div class="subtitle">${escapeHtml(subtitle)}</div>
      <div class="chips">
        <span class="chip">Resumo mensal</span>
        <span class="chip">GrÃ¡ficos + dados detalhados</span>
      </div>
      <div class="summary">${summaryHtml}</div>
    </header>
    ${chartsHtml}
    <section class="section">
      <h3>Dados Utilizados</h3>
      <div class="table-wrap">
        <table>
          <thead><tr>${tableHead}</tr></thead>
          <tbody>${tableBody}</tbody>
        </table>
      </div>
    </section>
    <div class="foot">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
  </div>
</body>
</html>`;
            }

            launchApp(appId) {
                if (this.openWindows.has(appId)) {
                    return;
                }

                const app = this.apps.find(a => a.id === appId);
                if (!app) return;

                const windowId = `window-${appId}`;
                const windowElement = document.createElement('div');
                windowElement.id = windowId;
                windowElement.className = 'app-window maximized';
                windowElement.innerHTML = `
                    <div class="window-header maximized">
                        <div class="window-title-group">
                            <i class="fas ${app.icon}"></i>
                            <div class="window-title">${app.title}</div>
                        </div>
                        <div class="window-controls">
                            <button class="window-btn" onclick="superApp.goHome('${windowId}')" title="Voltar ao incio">
                                <i class="fas fa-home"></i>
                            </button>
                            <button class="window-btn" onclick="superApp.closeWindow('${windowId}')" title="Fechar">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    <div class="window-content maximized">
                        <div class="window-placeholder">
                            <i class="fas ${app.icon}"></i>
                            <p style="font-weight: 600; margin-bottom: 0.5rem;">${app.title}</p>
                            <p style="font-size: 0.75rem; margin-top: 1rem; color: #d1d5db;">Carregando...</p>
                        </div>
                    </div>
                `;

                document.getElementById('windowsContainer').appendChild(windowElement);
                this.openWindows.set(appId, windowElement);
                this.updateStatistics();
                const contentEl = windowElement.querySelector('.window-content');
                contentEl.setAttribute('data-app-id', appId);
                this.loadAppContent(appId, contentEl);
            }

            getMesAnoAtual() {
                const d = new Date();
                return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            }
            async loadAppContent(appId, contentEl) {
                if (contentEl && typeof contentEl._cleanup === 'function') {
                    contentEl._cleanup();
                }
                const prevRoot = contentEl.querySelector('#fluxograma-root');
                if (prevRoot && prevRoot._fluxOnResize) {
                    window.removeEventListener('resize', prevRoot._fluxOnResize);
                }
                contentEl.classList.remove('fluxograma-window-content');
                contentEl.innerHTML = '<div class="app-loading"><i class="fas fa-spinner spinner"></i> Carregando...</div>';
                if (appId === 'fluxograma') {
                    contentEl.classList.add('fluxograma-window-content');
                    await this.renderFluxogramaContent(contentEl);
                    return;
                }
                if (appId === 'missoes_treino') {
                    try {
                        const mod = await import('./modulos/missoes_treino/index.js');
                        mod.renderMissoesTreinoContent(contentEl);
                    } catch (err) {
                        console.error(err);
                        contentEl.innerHTML = '<div class="app-error"><i class="fas fa-exclamation-triangle"></i> Nao foi possivel carregar Missoes de Treino.</div>';
                    }
                    return;
                }
                const apiMap = { financeiro: 'financeiro', lista_compras: 'lista-compras', saude: 'saude' };
                const path = apiMap[appId];
                if (!path) return;
                let mesAno = contentEl.getAttribute('data-mes-ano');
                if (appId === 'financeiro' && !mesAno) mesAno = this.getMesAnoAtual();
                try {
                    let url = path === 'saude' ? '/api/saude' : '/api/' + path;
                    if (appId === 'financeiro') url = '/api/financeiro?bi=1&mes_ano=' + encodeURIComponent(mesAno || this.getMesAnoAtual());
                    const res = await fetch(url);
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Falha ao carregar');
                    if (appId === 'financeiro') { contentEl.setAttribute('data-mes-ano', data.mes_ano || mesAno); this.renderFinanceiroContent(contentEl, data); }
                    else if (appId === 'lista_compras') this.renderListaComprasContent(contentEl, data);
                    else if (appId === 'saude') this.renderSaudeContent(contentEl, data);
                } catch (err) {
                    contentEl.innerHTML = '<div class="app-error"><i class="fas fa-exclamation-triangle"></i> ' + (err.message || 'Erro ao carregar') + '</div>';
                }
            }

            async refreshAppContent(appId) {
                const win = this.openWindows.get(appId);
                if (win) {
                    const contentEl = win.querySelector('.window-content');
                    if (contentEl) await this.loadAppContent(appId, contentEl);
                }
            }

            renderFinanceiroContent(el, data) {
                if (el._mesCheckInterval) clearInterval(el._mesCheckInterval);
                if (el._financeiroChartCategoria) { el._financeiroChartCategoria.destroy(); el._financeiroChartCategoria = null; }
                if (el._financeiroChartStatus) { el._financeiroChartStatus.destroy(); el._financeiroChartStatus = null; }
                const tabRaw = (el.getAttribute('data-active-tab') || '').toLowerCase();
                const activeTab = ['summary', 'data', 'poupanca'].includes(tabRaw) ? tabRaw : 'summary';
                el.setAttribute('data-active-tab', activeTab);

                const dashboard = data.dashboard || {};
                const graficos = data.graficos || {};
                const tabelas = data.tabelas || {};
                const despesasFixas = tabelas.despesas_fixas || [];
                const gastosVariados = tabelas.gastos_variados || [];
                const receitas = tabelas.receitas || [];
                const poupancaLogs = (data.poupanca && data.poupanca.logs) || tabelas.poupanca || [];
                const poupancaTotal = Number((data.poupanca && data.poupanca.total) || 0);
                const poupancaConfigurada = data.poupanca ? data.poupanca.configurada !== false : true;
                const poupancaMetaConfigurada = data.poupanca ? data.poupanca.meta_configurada !== false : true;
                const poupancaMetaAtiva = (data.poupanca && data.poupanca.meta_ativa) || null;
                const receitasVal = Number(dashboard.receitas) || 0;
                const despesasFixasVal = Number(dashboard.despesas_fixas) || 0;
                const despesasVariadasVal = Number(dashboard.despesas_variadas) || 0;
                const liquidoVal = Number(dashboard.liquido) || 0;
                const pagosPendentes = graficos.pagos_pendentes || {};
                const categoriasGastos = graficos.categorias_gastos || [];

                const mesAno = data.mes_ano || el.getAttribute('data-mes-ano') || this.getMesAnoAtual();
                const [ano, mes] = mesAno.split('-').map(Number);
                const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                const currentYear = new Date().getFullYear();
                const fromYear = Math.min(ano, currentYear - 15);
                const toYear = Math.max(ano, currentYear + 2);
                const anos = Array.from({ length: Math.max(1, toYear - fromYear + 1) }, (_, i) => fromYear + i);
                const fmtDataBr = (isoDate) => {
                    const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
                    return m ? `${m[3]}/${m[2]}/${m[1]}` : '--';
                };
                const fmtHoraBrasilia = (isoStamp) => {
                    if (!isoStamp) return '';
                    try {
                        return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(isoStamp));
                    } catch (e) { return ''; }
                };
                const lancDate = (r) => String((r && (r.data_lancamento || (r.created_at && String(r.created_at).slice(0, 10)))) || '').slice(0, 10);

                const mkRowFixa = (r) => {
                    const statusRaw = String(r.status || 'pendente').toLowerCase();
                    const statusLabel = statusRaw === 'pago' ? 'Pago' : 'Pendente';
                    const badgeClass = statusRaw === 'pago' ? 'is-paid' : 'is-pending';
                    const hora = fmtHoraBrasilia(r.created_at);
                    return `<tr>
                        <td><strong>${escapeHtml(r.descricao || '')}</strong></td>
                        <td><span class="module-status-badge ${badgeClass}">${statusLabel}</span></td>
                        <td style="color:${statusRaw === 'pago' ? '#22c55e' : '#ef4444'}">${this.formatMoneyBr(Number(r.valor || 0))}</td>
                        <td>${escapeHtml(fmtDataBr(lancDate(r)))}${hora ? `<br><span style="font-size:0.72rem;color:#9ca3af;">${escapeHtml(hora)}</span>` : ''}</td>
                        <td class="col-actions">
                            <div class="app-list-actions">
                                <button type="button" data-action="financeiro-edit" data-id="${r.id}" data-tipo-registro="despesa_fixa">Editar</button>
                                <button type="button" data-action="financeiro-delete" data-id="${r.id}" data-tipo-registro="despesa_fixa">Excluir</button>
                            </div>
                        </td>
                    </tr>`;
                };
                const mkRowFin = (r) => {
                    const hora = fmtHoraBrasilia(r.created_at);
                    return `<tr>
                        <td><strong>${escapeHtml(r.descricao || '')}</strong></td>
                        <td>${escapeHtml(r.categoria || '--')}</td>
                        <td style="color:${String(r.tipo_registro) === 'receita' ? '#22c55e' : '#ef4444'}">${this.formatMoneyBr(Number(r.valor || 0))}</td>
                        <td>${escapeHtml(fmtDataBr(lancDate(r)))}${hora ? `<br><span style="font-size:0.72rem;color:#9ca3af;">${escapeHtml(hora)}</span>` : ''}</td>
                        <td class="col-actions">
                            <div class="app-list-actions">
                                <button type="button" data-action="financeiro-edit" data-id="${r.id}" data-tipo-registro="${escapeHtml(r.tipo_registro || 'gasto_variado')}">Editar</button>
                                <button type="button" data-action="financeiro-delete" data-id="${r.id}" data-tipo-registro="${escapeHtml(r.tipo_registro || 'gasto_variado')}">Excluir</button>
                            </div>
                        </td>
                    </tr>`;
                };

                const rowsFixasHtml = despesasFixas.length ? despesasFixas.map(mkRowFixa).join('') : '<tr><td colspan="5" class="module-table-empty">Nenhuma despesa fixa neste mÃªs.</td></tr>';
                const rowsGastosHtml = gastosVariados.length ? gastosVariados.map(mkRowFin).join('') : '<tr><td colspan="5" class="module-table-empty">Nenhum gasto variado neste mÃªs.</td></tr>';
                const rowsReceitasHtml = receitas.length ? receitas.map(mkRowFin).join('') : '<tr><td colspan="5" class="module-table-empty">Nenhuma receita neste mÃªs.</td></tr>';
                const rowsPoupancaHtml = poupancaLogs.length
                    ? poupancaLogs.map((r) => {
                        const hora = fmtHoraBrasilia(r.created_at);
                        return `<tr>
                            <td><strong>${escapeHtml(r.descricao || '')}</strong></td>
                            <td style="color:#22c55e">${this.formatMoneyBr(Number(r.valor || 0))}</td>
                            <td>${escapeHtml(fmtDataBr(lancDate(r)))}${hora ? `<br><span style="font-size:0.72rem;color:#9ca3af;">${escapeHtml(hora)}</span>` : ''}</td>
                            <td class="col-actions">
                                <div class="app-list-actions">
                                    <button type="button" data-action="financeiro-edit" data-id="${r.id}" data-tipo-registro="poupanca">Editar</button>
                                    <button type="button" data-action="financeiro-delete" data-id="${r.id}" data-tipo-registro="poupanca">Excluir</button>
                                </div>
                            </td>
                        </tr>`;
                    }).join('')
                    : '<tr><td colspan="4" class="module-table-empty">Nenhum lanÃ§amento em poupanÃ§a.</td></tr>';
                const metaNome = String(poupancaMetaAtiva?.nome_meta || '').trim();
                const metaId = Number(poupancaMetaAtiva?.id || 0);
                const metaValor = Number(poupancaMetaAtiva?.valor_meta || 0);
                const metaInicio = String(poupancaMetaAtiva?.data_inicio || '').slice(0, 10);
                const metaProgresso = metaValor > 0 ? Math.max(0, Math.min(1, poupancaTotal / metaValor)) : 0;
                const metaPercent = Math.round(metaProgresso * 100);
                const metaRestante = Math.max(0, Math.round((metaValor - poupancaTotal) * 100) / 100);

                el.innerHTML = `
                    <div class="finance-module-shell">
                        <div class="finance-sticky-head">
                            <div class="app-mes-ano">
                                <label>MÃªs/Ano</label>
                                <select id="financeiro-mes">${meses.map((m, i) => `<option value="${i + 1}" ${(i + 1 === mes) ? 'selected' : ''}>${m}</option>`).join('')}</select>
                                <select id="financeiro-ano">${anos.map((a) => `<option value="${a}" ${(a === ano) ? 'selected' : ''}>${a}</option>`).join('')}</select>
                            </div>
                            <div class="module-tabbar" role="tablist" aria-label="Subabas de financeiro">
                                <button type="button" class="module-tab-btn ${activeTab === 'summary' ? 'is-active' : ''}" data-action="module-tab" data-tab="summary" role="tab" aria-selected="${activeTab === 'summary' ? 'true' : 'false'}">Resumo</button>
                                <button type="button" class="module-tab-btn ${activeTab === 'data' ? 'is-active' : ''}" data-action="module-tab" data-tab="data" role="tab" aria-selected="${activeTab === 'data' ? 'true' : 'false'}">Dados</button>
                                <button type="button" class="module-tab-btn ${activeTab === 'poupanca' ? 'is-active' : ''}" data-action="module-tab" data-tab="poupanca" role="tab" aria-selected="${activeTab === 'poupanca' ? 'true' : 'false'}">PoupanÃ§a</button>
                            </div>
                            <div class="finance-data-filter-bar" style="${activeTab === 'data' ? '' : 'display:none;'}">
                                <label for="financeiro-data-target">Tabela</label>
                                <select id="financeiro-data-target">
                                    <option value="all">Todas</option>
                                    <option value="despesas_fixas">Despesas Fixas</option>
                                    <option value="gastos_variados">Gastos Variados</option>
                                    <option value="receitas">Receitas</option>
                                </select>
                                <div class="finance-jump-actions">
                                    <button type="button" class="app-btn app-btn-secondary" data-action="financeiro-jump" data-target="despesas_fixas">Ir p/ Fixas</button>
                                    <button type="button" class="app-btn app-btn-secondary" data-action="financeiro-jump" data-target="gastos_variados">Ir p/ Variadas</button>
                                    <button type="button" class="app-btn app-btn-secondary" data-action="financeiro-jump" data-target="receitas">Ir p/ Receitas</button>
                                </div>
                            </div>
                        </div>
                        <div class="module-tab-panel ${activeTab === 'summary' ? '' : 'hidden'}" data-tab-panel="summary">
                            <div class="app-totais">
                                <div class="totais-card"><div class="val" style="color:#22c55e">${this.formatMoneyBr(receitasVal)}</div><div class="stat-label">Receitas</div></div>
                                <div class="totais-card"><div class="val" style="color:#ef4444">${this.formatMoneyBr(despesasFixasVal)}</div><div class="stat-label">Despesas fixas</div></div>
                                <div class="totais-card"><div class="val" style="color:#f97316">${this.formatMoneyBr(despesasVariadasVal)}</div><div class="stat-label">Despesas variadas</div></div>
                                <div class="totais-card"><div class="val" style="color:${liquidoVal >= 0 ? '#2563eb' : '#dc2626'}">${this.formatMoneyBr(liquidoVal)}</div><div class="stat-label">LÃ­quido</div></div>
                            </div>
                            <div class="app-charts">
                                <div class="app-chart-wrap"><p style="font-size:0.875rem;font-weight:600;margin-bottom:0.5rem;">Categorias de gastos</p><canvas id="financeiro-chart-categorias"></canvas></div>
                                <div class="app-chart-wrap"><p style="font-size:0.875rem;font-weight:600;margin-bottom:0.5rem;">Despesas fixas: pagos x pendentes</p><canvas id="financeiro-chart-status"></canvas></div>
                            </div>
                        </div>
                        <div class="module-tab-panel ${activeTab === 'data' ? '' : 'hidden'}" data-tab-panel="data">
                            <div class="module-data-toolbar">
                                <p class="app-form-note" style="margin:0;">3 tabelas em ordem cronolÃ³gica (mais recente primeiro).</p>
                            </div>
                            <div class="module-table-wrap finance-data-section" data-table-section="despesas_fixas" id="financeiro-section-despesas-fixas">
                                <p style="font-size:0.875rem;font-weight:600;margin-bottom:0.4rem;">Despesas fixas</p>
                                <table class="module-table">
                                    <thead><tr><th>DescriÃ§Ã£o</th><th>Status</th><th>Valor</th><th>Data</th><th>AÃ§Ãµes</th></tr></thead>
                                    <tbody id="financeiro-table-fixas">${rowsFixasHtml}</tbody>
                                </table>
                            </div>
                            <div class="module-table-wrap finance-data-section" data-table-section="gastos_variados" id="financeiro-section-gastos-variados" style="margin-top:0.85rem;">
                                <p style="font-size:0.875rem;font-weight:600;margin-bottom:0.4rem;">Gastos variados</p>
                                <table class="module-table">
                                    <thead><tr><th>DescriÃ§Ã£o</th><th>Categoria</th><th>Valor</th><th>Data</th><th>AÃ§Ãµes</th></tr></thead>
                                    <tbody id="financeiro-table-gastos">${rowsGastosHtml}</tbody>
                                </table>
                            </div>
                            <div class="module-table-wrap finance-data-section" data-table-section="receitas" id="financeiro-section-receitas" style="margin-top:0.85rem;">
                                <p style="font-size:0.875rem;font-weight:600;margin-bottom:0.4rem;">Receitas</p>
                                <table class="module-table">
                                    <thead><tr><th>DescriÃ§Ã£o</th><th>Categoria</th><th>Valor</th><th>Data</th><th>AÃ§Ãµes</th></tr></thead>
                                    <tbody id="financeiro-table-receitas">${rowsReceitasHtml}</tbody>
                                </table>
                            </div>
                        </div>
                        <div class="module-tab-panel ${activeTab === 'poupanca' ? '' : 'hidden'}" data-tab-panel="poupanca">
                            <div class="app-totais">
                                <div class="totais-card"><div class="val" style="color:#22c55e">${this.formatMoneyBr(poupancaTotal)}</div><div class="stat-label">Total acumulado em poupanÃ§a</div></div>
                            </div>
                            ${poupancaConfigurada ? '' : '<p class="app-form-note" style="color:#fca5a5;">Tabela `tb_poupanca` nÃ£o encontrada no Supabase. Crie a tabela para habilitar este mÃ³dulo.</p>'}
                            ${poupancaMetaConfigurada ? '' : '<p class="app-form-note" style="color:#fca5a5;">Tabela `tb_poupanca_metas` nÃ£o encontrada no Supabase. Crie a tabela para habilitar metas.</p>'}
                            <div class="poupanca-meta-entry-card">
                                <div>
                                    <h4>Adicionar Meta</h4>
                                    <p>Abra o formulÃ¡rio padrÃ£o para cadastrar descriÃ§Ã£o, valor e data de inÃ­cio.</p>
                                </div>
                                <button type="button" class="app-btn" data-action="poupanca-open-meta-modal">Adicionar Meta</button>
                            </div>
                            ${metaValor > 0 ? `
                                <div class="poupanca-meta-card">
                                    <div class="poupanca-meta-card-top">
                                        <div>
                                            <h4>${escapeHtml(metaNome || 'Meta de poupanÃ§a')}</h4>
                                            <p class="meta-sub">InÃ­cio: ${escapeHtml(metaInicio ? this.formatDateBr(metaInicio) : '--')}</p>
                                        </div>
                                        <div class="poupanca-meta-card-actions">
                                            <button type="button" class="app-btn app-btn-secondary" data-action="poupanca-meta-edit" data-id="${metaId}">Editar</button>
                                            <button type="button" class="app-btn app-btn-secondary" data-action="poupanca-meta-delete" data-id="${metaId}">Excluir</button>
                                        </div>
                                    </div>
                                    <div class="poupanca-meta-chart-grid">
                                        <div class="poupanca-meta-chart-wrap">
                                            <div id="financeiro-poupanca-meta-chart" class="poupanca-meta-chart"></div>
                                        </div>
                                        <div class="poupanca-meta-insight">
                                            <div class="title">TermÃ´metro da meta</div>
                                            <div class="value">${metaPercent}%</div>
                                            <p class="meta-sub" style="margin-top:0.25rem;">Faixas: atÃ© 29% em azul, de 30% a 99% em amarelo, e meta concluÃ­da em verde.</p>
                                        </div>
                                    </div>
                                    <div class="poupanca-meta-stats">
                                        <div><span>Meta</span><strong>${this.formatMoneyBr(metaValor)}</strong></div>
                                        <div><span>Acumulado</span><strong>${this.formatMoneyBr(poupancaTotal)}</strong></div>
                                        <div><span>Progresso</span><strong>${metaPercent}%</strong></div>
                                        <div><span>Faltam</span><strong>${this.formatMoneyBr(metaRestante)}</strong></div>
                                    </div>
                                </div>
                            ` : ''}
                            <div class="module-table-wrap">
                                <table class="module-table">
                                    <thead><tr><th>DescriÃ§Ã£o</th><th>Valor</th><th>Data</th><th>AÃ§Ãµes</th></tr></thead>
                                    <tbody id="financeiro-table-poupanca">${rowsPoupancaHtml}</tbody>
                                </table>
                            </div>
                        </div>
                        <button type="button" class="finance-fab finance-fab-pulse" data-action="financeiro-open-modal" aria-label="Adicionar registro financeiro">+</button>
                    </div>
                `;
                if (el._financeiroPoupancaMetaChart) {
                    try { el._financeiroPoupancaMetaChart.dispose(); } catch (_) {}
                    el._financeiroPoupancaMetaChart = null;
                }

                const itemMap = new Map();
                despesasFixas.forEach((r) => itemMap.set(`despesa_fixa:${r.id}`, r));
                gastosVariados.forEach((r) => itemMap.set(`gasto_variado:${r.id}`, r));
                receitas.forEach((r) => itemMap.set(`receita:${r.id}`, r));
                poupancaLogs.forEach((r) => itemMap.set(`poupanca:${r.id}`, r));

                const ensureCharts = () => {
                    const summaryPanel = el.querySelector('[data-tab-panel="summary"]');
                    if (!summaryPanel || summaryPanel.classList.contains('hidden')) return;
                    if (typeof Chart === 'undefined') {
                        this.ensureVisualizationLibraries().then(() => this.refreshAppContent('financeiro')).catch(() => {});
                        return;
                    }
                    const valueLabelsPlugin = this.buildInlineChartValuePlugin({ asMoney: true });
                    const ctxCategorias = el.querySelector('#financeiro-chart-categorias');
                    if (ctxCategorias && !el._financeiroChartCategoria) {
                        const labels = categoriasGastos.map((x) => x.categoria);
                        const valores = categoriasGastos.map((x) => x.valor);
                        if (labels.length > 0) {
                            el._financeiroChartCategoria = new Chart(ctxCategorias, {
                                type: 'bar',
                                data: {
                                    labels,
                                    datasets: [{
                                        label: 'Gastos (R$)',
                                        data: valores,
                                        borderRadius: 10,
                                        borderSkipped: false,
                                        backgroundColor: '#2563eb',
                                    }],
                                },
                                options: this.mergeChartOptions(
                                    this.getModernChartBaseOptions({ indexAxis: 'y', legend: false }),
                                    { indexAxis: 'y', scales: { x: { beginAtZero: true } } }
                                ),
                                plugins: [valueLabelsPlugin],
                            });
                        }
                    }
                    const ctxStatus = el.querySelector('#financeiro-chart-status');
                    if (ctxStatus && !el._financeiroChartStatus) {
                        const pago = Number(pagosPendentes.pago) || 0;
                        const pendente = Number(pagosPendentes.pendente) || 0;
                        if (pago > 0 || pendente > 0) {
                            el._financeiroChartStatus = new Chart(ctxStatus, {
                                type: 'doughnut',
                                data: {
                                    labels: ['Pago', 'Pendente'],
                                    datasets: [{
                                        data: [pago, pendente],
                                        backgroundColor: ['#22c55e', '#ef4444'],
                                        borderWidth: 2,
                                    }],
                                },
                                options: this.mergeChartOptions(
                                    this.getModernChartBaseOptions({ legend: true }),
                                    { cutout: '58%', plugins: { legend: { position: 'bottom' } } }
                                ),
                                plugins: [valueLabelsPlugin],
                            });
                        }
                    }
                };
                const ensurePoupancaMetaChart = () => {
                    const poupancaPanel = el.querySelector('[data-tab-panel="poupanca"]');
                    if (!poupancaPanel || poupancaPanel.classList.contains('hidden')) return;
                    const chartNode = el.querySelector('#financeiro-poupanca-meta-chart');
                    if (!chartNode || !(metaValor > 0)) return;
                    if (typeof echarts === 'undefined') {
                        this.ensureVisualizationLibraries().then(() => this.refreshAppContent('financeiro')).catch(() => {});
                        return;
                    }
                    const progress = Math.max(0, Math.min(100, Number(metaPercent) || 0));
                    const progressColor = progress >= 100 ? '#22c55e' : (progress >= 30 ? '#facc15' : '#38bdf8');
                    let chart = el._financeiroPoupancaMetaChart;
                    if (!chart || chart.isDisposed?.()) {
                        chart = echarts.init(chartNode);
                        el._financeiroPoupancaMetaChart = chart;
                    }
                    chart.setOption({
                        animationDuration: 700,
                        animationEasing: 'cubicOut',
                        tooltip: {
                            trigger: 'item',
                            formatter: () => `Progresso: ${progress}%<br/>Acumulado: ${this.formatMoneyBr(poupancaTotal)}<br/>Meta: ${this.formatMoneyBr(metaValor)}`,
                            backgroundColor: 'rgba(8, 20, 38, 0.96)',
                            borderColor: 'rgba(148, 163, 184, 0.35)',
                            textStyle: { color: '#dbeafe' },
                        },
                        series: [{
                            type: 'gauge',
                            min: 0,
                            max: 100,
                            startAngle: 225,
                            endAngle: -45,
                            center: ['50%', '58%'],
                            radius: '95%',
                            pointer: { show: false },
                            progress: {
                                show: true,
                                roundCap: true,
                                width: 20,
                                itemStyle: { color: progressColor, shadowBlur: 14, shadowColor: `${progressColor}55` },
                            },
                            axisLine: {
                                roundCap: true,
                                lineStyle: { width: 20, color: [[1, 'rgba(71, 98, 138, 0.35)']] },
                            },
                            axisTick: { show: false },
                            splitLine: { show: false },
                            axisLabel: { show: false },
                            anchor: { show: false },
                            title: { show: false },
                            detail: {
                                valueAnimation: true,
                                offsetCenter: [0, '8%'],
                                formatter: '{value}%',
                                color: '#f8fbff',
                                fontSize: 32,
                                fontWeight: 800,
                            },
                            data: [{ value: progress }],
                        }],
                    }, true);
                    chart.resize();
                };

                const setTab = (tab) => {
                    el.setAttribute('data-active-tab', tab);
                    el.querySelectorAll('[data-action="module-tab"]').forEach((btn) => {
                        const active = btn.dataset.tab === tab;
                        btn.classList.toggle('is-active', active);
                        btn.setAttribute('aria-selected', active ? 'true' : 'false');
                    });
                    el.querySelectorAll('[data-tab-panel]').forEach((panel) => {
                        panel.classList.toggle('hidden', panel.dataset.tabPanel !== tab);
                    });
                    const dataFilterBar = el.querySelector('.finance-data-filter-bar');
                    if (dataFilterBar) dataFilterBar.style.display = tab === 'data' ? '' : 'none';
                    const mesAnoBar = el.querySelector('.finance-sticky-head .app-mes-ano');
                    if (mesAnoBar) mesAnoBar.style.display = tab === 'poupanca' ? 'none' : '';
                    if (tab === 'summary') ensureCharts();
                    if (tab === 'poupanca') ensurePoupancaMetaChart();
                };

                el.querySelectorAll('[data-action="module-tab"]').forEach((btn) => {
                    btn.onclick = () => setTab(btn.dataset.tab || 'summary');
                });
                setTab(activeTab);

                const applyDataTableFilter = () => {
                    const target = String(el.querySelector('#financeiro-data-target')?.value || 'all');
                    el.querySelectorAll('[data-table-section]').forEach((section) => {
                        const key = section.getAttribute('data-table-section');
                        const show = target === 'all' || key === target;
                        section.classList.toggle('hidden-by-filter', !show);
                    });
                };
                const jumpToDataSection = (target) => {
                    if (!target) return;
                    const select = el.querySelector('#financeiro-data-target');
                    if (select) {
                        select.value = target;
                        applyDataTableFilter();
                    }
                    const section = el.querySelector(`[data-table-section="${target}"]`);
                    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                };
                const dataTargetSelect = el.querySelector('#financeiro-data-target');
                if (dataTargetSelect) dataTargetSelect.onchange = applyDataTableFilter;
                el.querySelectorAll('[data-action="financeiro-jump"]').forEach((btn) => {
                    btn.onclick = () => {
                        setTab('data');
                        jumpToDataSection(btn.dataset.target || '');
                    };
                });
                applyDataTableFilter();

                const refreshMesAno = () => {
                    const m = el.querySelector('#financeiro-mes').value;
                    const a = el.querySelector('#financeiro-ano').value;
                    el.setAttribute('data-mes-ano', `${a}-${String(m).padStart(2, '0')}`);
                    this.refreshAppContent('financeiro');
                };
                el.querySelector('#financeiro-mes').onchange = refreshMesAno;
                el.querySelector('#financeiro-ano').onchange = refreshMesAno;

                el.querySelector('[data-action="financeiro-open-modal"]').onclick = () => {
                    const currentTab = String(el.getAttribute('data-active-tab') || 'summary');
                    const defaultTipo = currentTab === 'poupanca' ? 'poupanca' : 'gasto_variado';
                    this.openFinanceiroModal(el, { defaultTipo });
                };
                el.querySelectorAll('[data-action="financeiro-edit"]').forEach((btn) => {
                    btn.onclick = () => {
                        const tipo = btn.dataset.tipoRegistro || 'gasto_variado';
                        const item = itemMap.get(`${tipo}:${btn.dataset.id}`);
                        this.openFinanceiroModal(el, { item, defaultTipo: tipo });
                    };
                });
                el.querySelectorAll('[data-action="financeiro-delete"]').forEach((btn) => {
                    btn.onclick = () => this.submitFinanceiroDelete(btn.dataset.id, btn.dataset.tipoRegistro || 'gasto_variado', el);
                });
                const openMetaBtn = el.querySelector('[data-action="poupanca-open-meta-modal"]');
                if (openMetaBtn) {
                    openMetaBtn.onclick = () => this.openPoupancaMetaModal(el);
                }
                const editMetaBtn = el.querySelector('[data-action="poupanca-meta-edit"]');
                if (editMetaBtn) {
                    editMetaBtn.onclick = () => this.openPoupancaMetaModal(el, {
                        id: metaId,
                        nome_meta: metaNome,
                        valor_meta: metaValor,
                        data_inicio: metaInicio,
                    });
                }
                const deleteMetaBtn = el.querySelector('[data-action="poupanca-meta-delete"]');
                if (deleteMetaBtn) {
                    deleteMetaBtn.onclick = async () => {
                        const rawId = Number(deleteMetaBtn.dataset.id || 0);
                        if (!(rawId > 0)) return;
                        await this.submitFinanceiroMetaDelete(rawId, el);
                    };
                }

                let prevMesAno = this.getMesAnoAtual();
                el._mesCheckInterval = setInterval(() => {
                    const now = this.getMesAnoAtual();
                    if (now !== prevMesAno && el.getAttribute('data-mes-ano') === prevMesAno) {
                        el.setAttribute('data-mes-ano', now);
                        this.refreshAppContent('financeiro');
                    }
                    prevMesAno = now;
                }, 60000);
            }

            async submitFinanceiroMetaSave(el, { editId = 0, nomeMeta, dataInicio, valorMeta } = {}) {
                if (!nomeMeta) { alert('Nome da meta Ã© obrigatÃ³rio'); return false; }
                if (!(valorMeta > 0)) { alert('Valor da meta precisa ser maior que zero'); return false; }
                try {
                    const res = await fetch('/api/financeiro', {
                        method: editId > 0 ? 'PATCH' : 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...(editId > 0 ? { id: editId } : {}),
                            tipo_registro: 'meta_poupanca',
                            nome_meta: nomeMeta,
                            data_inicio: dataInicio || this.getBrazilDateIsoFrom(new Date()),
                            valor_meta: valorMeta,
                        }),
                    });
                    if (!res.ok) {
                        const d = await res.json();
                        throw new Error(d.error || 'Erro ao salvar meta');
                    }
                    await this.refreshAppContent('financeiro');
                    return true;
                } catch (e) {
                    alert(e.message);
                    return false;
                }
            }

            async submitFinanceiroMetaDelete(id, el) {
                if (!(await this.showConfirm('Excluir meta', 'Tem certeza que deseja excluir esta meta de poupanÃ§a?'))) return false;
                try {
                    const res = await fetch(`/api/financeiro?id=${encodeURIComponent(id)}&tipo_registro=meta_poupanca`, { method: 'DELETE' });
                    if (!res.ok) {
                        const d = await res.json();
                        throw new Error(d.error || 'Erro ao excluir meta');
                    }
                    await this.refreshAppContent('financeiro');
                    return true;
                } catch (e) {
                    alert(e.message);
                    return false;
                }
            }

            openPoupancaMetaModal(el, meta = null) {
                const editId = Number(meta?.id || 0);
                const overlay = document.createElement('div');
                overlay.className = 'app-modal-overlay';
                overlay.innerHTML = `
                    <div class="app-modal finance-entry-modal">
                        <h4>${editId > 0 ? 'Editar meta de poupanÃ§a' : 'Adicionar meta de poupanÃ§a'}</h4>
                        <div class="app-form">
                            <div class="app-form-row fin-form-grid">
                                <div class="field">
                                    <label>DescriÃ§Ã£o</label>
                                    <input type="text" id="poupanca-meta-modal-nome" value="${escapeHtml(String(meta?.nome_meta || ''))}" placeholder="Ex: Reserva de emergÃªncia" />
                                </div>
                                <div class="field">
                                    <label>Valor (R$)</label>
                                    <input type="number" step="0.01" id="poupanca-meta-modal-valor" value="${editId > 0 ? Number(meta?.valor_meta || 0) : ''}" />
                                </div>
                                <div class="field">
                                    <label>Data de inÃ­cio</label>
                                    <input type="date" id="poupanca-meta-modal-inicio" value="${escapeHtml(String(meta?.data_inicio || this.getBrazilDateIsoFrom(new Date())).slice(0, 10))}" />
                                </div>
                            </div>
                        </div>
                        <div class="app-modal-actions">
                            <button type="button" class="app-btn app-btn-secondary" data-action="modal-cancel">Cancelar</button>
                            <button type="button" class="app-btn" data-action="modal-save-meta">${editId > 0 ? 'Salvar' : 'Adicionar meta'}</button>
                        </div>
                    </div>
                `;

                const close = () => overlay.remove();
                overlay.querySelector('[data-action="modal-cancel"]').onclick = close;
                overlay.onclick = (e) => { if (e.target === overlay) close(); };
                overlay.querySelector('[data-action="modal-save-meta"]').onclick = async () => {
                    const nomeMeta = String(overlay.querySelector('#poupanca-meta-modal-nome')?.value || '').trim();
                    const valorMeta = Number(overlay.querySelector('#poupanca-meta-modal-valor')?.value || 0);
                    const dataInicio = String(overlay.querySelector('#poupanca-meta-modal-inicio')?.value || this.getBrazilDateIsoFrom(new Date()));
                    const ok = await this.submitFinanceiroMetaSave(el, { editId, nomeMeta, dataInicio, valorMeta });
                    if (ok) close();
                };
                document.body.appendChild(overlay);
            }

            openFinanceiroModal(el, { item = null, defaultTipo = 'gasto_variado' } = {}) {
                const mesAno = el.getAttribute('data-mes-ano') || this.getMesAnoAtual();
                const [ano, mes] = mesAno.split('-').map(Number);
                const pad = (n) => String(n).padStart(2, '0');
                const firstDayMonth = `${ano}-${pad(mes)}-01`;
                const lastDayMonth = `${ano}-${pad(mes)}-${pad(new Date(ano, mes, 0).getDate())}`;
                const gastoCategorias = ['Alimentacao','Habitacao','Transporte','Lazer','Saude','Compras','Contas','Outros'];
                const receitaCategorias = ['SalÃ¡rio','BenefÃ­cio','Outro'];
                const tipoRegistro = item?.tipo_registro || defaultTipo || 'gasto_variado';
                const overlay = document.createElement('div');
                overlay.className = 'app-modal-overlay';
                const initialDate = item?.data_lancamento ? String(item.data_lancamento).slice(0, 10) : firstDayMonth;
                overlay.innerHTML = `
                    <div class="app-modal finance-entry-modal">
                        <h4>${item ? 'Editar registro financeiro' : 'Novo registro financeiro'}</h4>
                        <p class="app-form-note" id="financeiro-modal-contexto">MÃªs de referÃªncia: <strong>${this.formatMesAnoLabel(mesAno)}</strong></p>
                        <div class="app-form">
                            <div class="app-form-row fin-form-grid">
                                <div class="field"><label>Tipo de registro</label>
                                    <select id="financeiro-modal-tipo">
                                        <option value="despesa_fixa" ${tipoRegistro === 'despesa_fixa' ? 'selected' : ''}>Despesa fixa</option>
                                        <option value="gasto_variado" ${tipoRegistro === 'gasto_variado' ? 'selected' : ''}>Despesa variada</option>
                                        <option value="receita" ${tipoRegistro === 'receita' ? 'selected' : ''}>Receita</option>
                                        <option value="poupanca" ${tipoRegistro === 'poupanca' ? 'selected' : ''}>PoupanÃ§a</option>
                                    </select>
                                </div>
                                <div class="field" id="financeiro-descricao-wrap"><label>DescriÃ§Ã£o</label><input type="text" id="financeiro-modal-descricao" value="${escapeHtml(item?.descricao || '')}" /></div>
                                <div class="field"><label>Valor (R$)</label><input type="number" step="0.01" id="financeiro-modal-valor" value="${item ? Number(item.valor || 0) : ''}" /></div>
                                <div class="field" id="financeiro-categoria-wrap"><label>Categoria</label><select id="financeiro-modal-categoria"></select></div>
                                <div class="field" id="financeiro-status-wrap"><label>Status (fixa)</label><select id="financeiro-modal-status"><option value="pendente" ${(String(item?.status || 'pendente').toLowerCase() === 'pendente') ? 'selected' : ''}>Pendente</option><option value="pago" ${(String(item?.status || '').toLowerCase() === 'pago') ? 'selected' : ''}>Pago</option></select></div>
                                <div class="field" id="financeiro-data-wrap"><label>Data do lanÃ§amento</label><input type="date" id="financeiro-modal-data" value="${escapeHtml(initialDate)}" min="${firstDayMonth}" max="${lastDayMonth}" /></div>
                            </div>
                        </div>
                        <div class="app-modal-actions">
                            <button type="button" class="app-btn app-btn-secondary" data-action="modal-cancel">Cancelar</button>
                            <button type="button" class="app-btn" data-action="modal-save">${item ? 'Salvar' : 'Registrar'}</button>
                        </div>
                    </div>
                `;
                const tipoEl = overlay.querySelector('#financeiro-modal-tipo');
                const catEl = overlay.querySelector('#financeiro-modal-categoria');
                const catWrap = overlay.querySelector('#financeiro-categoria-wrap');
                const statusWrap = overlay.querySelector('#financeiro-status-wrap');
                const dataWrap = overlay.querySelector('#financeiro-data-wrap');
                const descricaoWrap = overlay.querySelector('#financeiro-descricao-wrap');
                const descricaoEl = overlay.querySelector('#financeiro-modal-descricao');
                const dataEl = overlay.querySelector('#financeiro-modal-data');
                const contextoEl = overlay.querySelector('#financeiro-modal-contexto');
                const setTipoUI = (tipo) => {
                    if (tipo === 'despesa_fixa') {
                        if (descricaoWrap) descricaoWrap.style.display = '';
                        catWrap.style.display = 'none';
                        dataWrap.style.display = 'none';
                        if (dataEl) {
                            dataEl.setAttribute('min', firstDayMonth);
                            dataEl.setAttribute('max', lastDayMonth);
                        }
                        statusWrap.style.display = '';
                        catEl.innerHTML = '<option value="">--</option>';
                        if (contextoEl) contextoEl.innerHTML = `MÃªs de referÃªncia: <strong>${this.formatMesAnoLabel(mesAno)}</strong>`;
                    } else if (tipo === 'poupanca') {
                        if (descricaoWrap) descricaoWrap.style.display = 'none';
                        if (descricaoEl && !descricaoEl.value) descricaoEl.value = 'PoupanÃ§a';
                        statusWrap.style.display = 'none';
                        dataWrap.style.display = '';
                        if (dataEl) {
                            dataEl.removeAttribute('min');
                            dataEl.removeAttribute('max');
                        }
                        catWrap.style.display = 'none';
                        catEl.innerHTML = '<option value="">--</option>';
                        if (contextoEl) contextoEl.textContent = 'Registro de poupanÃ§a (sem filtro mensal).';
                    } else {
                        if (descricaoWrap) descricaoWrap.style.display = '';
                        statusWrap.style.display = 'none';
                        dataWrap.style.display = '';
                        if (dataEl) {
                            dataEl.setAttribute('min', firstDayMonth);
                            dataEl.setAttribute('max', lastDayMonth);
                        }
                        catWrap.style.display = '';
                        const categories = tipo === 'receita' ? receitaCategorias : gastoCategorias;
                        catEl.innerHTML = `<option value="">--</option>${categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}`;
                        if (item?.categoria) catEl.value = item.categoria;
                        if (contextoEl) contextoEl.innerHTML = `MÃªs de referÃªncia: <strong>${this.formatMesAnoLabel(mesAno)}</strong>`;
                    }
                };
                setTipoUI(tipoEl.value);
                tipoEl.onchange = () => setTipoUI(tipoEl.value);

                const close = () => overlay.remove();
                overlay.querySelector('[data-action="modal-cancel"]').onclick = close;
                overlay.onclick = (e) => { if (e.target === overlay) close(); };
                overlay.querySelector('[data-action="modal-save"]').onclick = async () => {
                    const payload = {
                        editId: item?.id || '',
                        tipo_registro: tipoEl.value,
                        descricao: overlay.querySelector('#financeiro-modal-descricao').value.trim(),
                        valor: Number(overlay.querySelector('#financeiro-modal-valor').value || 0),
                        categoria: catEl.value || null,
                        status: overlay.querySelector('#financeiro-modal-status').value || 'pendente',
                        data_lancamento: overlay.querySelector('#financeiro-modal-data').value || firstDayMonth,
                        mesAno,
                    };
                    const ok = await this.submitFinanceiroSave(el, payload);
                    if (ok) close();
                };
                document.body.appendChild(overlay);
            }

            async submitFinanceiroSave(el, payload = null) {
                const editId = String(payload?.editId || '').trim();
                const tipoRegistro = String(payload?.tipo_registro || '').trim();
                const descricao = String(payload?.descricao || '').trim();
                const valor = Number(payload?.valor || 0);
                const categoria = payload?.categoria || null;
                const status = String(payload?.status || 'pendente').toLowerCase();
                const dataLanc = String(payload?.data_lancamento || '');
                const mesAno = payload?.mesAno || el.getAttribute('data-mes-ano') || this.getMesAnoAtual();
                if (!['despesa_fixa', 'gasto_variado', 'receita', 'poupanca'].includes(tipoRegistro)) { alert('Tipo de registro invÃ¡lido'); return false; }
                if (tipoRegistro !== 'poupanca' && !descricao) { alert('DescriÃ§Ã£o Ã© obrigatÃ³ria'); return false; }
                if (tipoRegistro !== 'despesa_fixa' && tipoRegistro !== 'poupanca') {
                    const [yy, mm] = mesAno.split('-').map(Number);
                    const [dy, dm] = dataLanc.split('-').map(Number);
                    if (dy !== yy || dm !== mm) {
                        alert('A data do lanÃ§amento precisa estar dentro do mÃªs selecionado.');
                        return false;
                    }
                }
                const requestBody = {
                    tipo_registro: tipoRegistro,
                    descricao: tipoRegistro === 'poupanca' ? (descricao || 'PoupanÃ§a') : descricao,
                    valor,
                    mes_ano: mesAno,
                };
                if (tipoRegistro === 'despesa_fixa') requestBody.status = status === 'pago' ? 'pago' : 'pendente';
                else if (tipoRegistro === 'poupanca') {
                    requestBody.data_lancamento = dataLanc;
                } else {
                    requestBody.categoria = categoria;
                    requestBody.data_lancamento = dataLanc;
                }
                if (editId) requestBody.id = editId;
                try {
                    const res = await fetch('/api/financeiro', {
                        method: editId ? 'PATCH' : 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody),
                    });
                    if (!res.ok) {
                        const d = await res.json();
                        throw new Error(d.error || 'Erro ao salvar');
                    }
                    await this.refreshAppContent('financeiro');
                    return true;
                } catch (e) {
                    alert(e.message);
                    return false;
                }
            }

            async submitFinanceiroDelete(id, tipoRegistro, el) {
                if (!(await this.showConfirm('Excluir registro', 'Tem certeza que deseja excluir este registro financeiro?'))) return;
                try {
                    const res = await fetch(`/api/financeiro?id=${encodeURIComponent(id)}&tipo_registro=${encodeURIComponent(tipoRegistro)}`, { method: 'DELETE' });
                    if (!res.ok) {
                        const d = await res.json();
                        throw new Error(d.error || 'Erro ao excluir');
                    }
                    await this.refreshAppContent('financeiro');
                } catch (e) { alert(e.message); }
            }

            async renderFluxogramaContent(el) {
                window.__SUPERAPP_FLUX_EMBED__ = true;
                el.innerHTML = `
                    <div id="fluxograma-root" class="fluxograma-root">
                        <div id="flux-hub-screen" class="flux-hub-screen">
                            <div class="flux-hub-top">
                                <div>
                                    <h1>Fluxogramas</h1>
                                    <p>Abra um projeto ou crie um novo  alteraes so salvas na nuvem automaticamente</p>
                                </div>
                                <span id="flux-hub-status" class="flux-hub-status"></span>
                            </div>
                            <div id="flux-hub-error" class="flux-hub-error" role="alert"></div>
                            <div id="flux-hub-cards-wrap" class="flux-hub-cards-wrap">
                                <button type="button" id="flux-hub-new" class="flux-project-card flux-project-card--new">
                                    <span class="flux-card-new-icon" aria-hidden="true">+</span>
                                    <span class="flux-card-title">Novo projeto</span>
                                    <span class="flux-card-meta">Canvas em branco</span>
                                </button>
                            </div>
                        </div>
                        <div id="flux-editor-screen" class="flux-editor-screen">
                        <header>
                            <div class="flux-fc-editor-top">
                                <button type="button" class="sec mini" id="flux-back-hub">Meus projetos</button>
                                <span id="flux-autosave-status" style="font-size:0.78rem;flex:1;min-width:120px;"></span>
                            </div>
                            <div class="flux-fc-header-wrap">
                                <div>
                                    <h1>Criador de Fluxograma</h1>
                                    <p>Organize suas ideias</p>
                                </div>
                                <div class="menu-tools">
                                    <label>Forma</label>
                                    <select id="flux-nodeShapeSelect">
                                        <option value="rect">Retangulo</option>
                                        <option value="ellipse">Elipse</option>
                                        <option value="diamond">Losango</option>
                                        <option value="hexagon">Hexagono</option>
                                    </select>
                                    <label>ConexÃ£o</label>
                                    <select id="flux-connectionTypeSelect">
                                        <option value="arrow">Seta ida</option>
                                        <option value="both">Seta ida/volta</option>
                                        <option value="line">Fio direto</option>
                                        <option value="curve">Curva suave</option>
                                    </select>
                                    <button type="button" class="sec mini" id="flux-disconnectActionBtn" onclick="toggleDisconnectFromMenu()" title="Selecione um no, clique em Desconectar ns e depois toque no no destino">Desconectar ns</button>
                                    <label>Cores</label>
                                    <div id="flux-colorPalette" class="flux-color-palette" role="group" aria-label="Paleta de cores"></div>
                                    <span class="flux-color-preview-item" title="Cor atual do item selecionado">
                                        <span id="flux-currentColorSwatch" class="flux-color-preview-swatch is-empty"></span>
                                        <span id="flux-currentColorText">Sem selecao</span>
                                    </span>
                                    <span class="flux-color-preview-item" title="Ãšltima cor usada">
                                        <span id="flux-activeColorSwatch" class="flux-color-preview-swatch"></span>
                                        <span id="flux-activeColorText">#3B82F6</span>
                                    </span>
                                </div>
                                <div class="flux-fc-stats">
                                    <span>Nos: <b id="flux-totalNodes">0</b></span>
                                    <span>ConexÃµes: <b id="flux-totalConnections">0</b></span>
                                    <span>Conectados: <b id="flux-connectedNodes">0</b></span>
                                </div>
                                <div class="flux-fc-actions">
                                    <button type="button" class="sec" onclick="renameProject()">Renomear Projeto</button>
                                    <button type="button" class="sec" id="flux-viewModeBtn" onclick="toggleViewMode()">Visualizar</button>
                                </div>
                            </div>
                        </header>
                        <div class="flux-fc-container">
                            <div class="flux-fc-grid">
                                <div class="flux-fc-card">
                                    <h2>Canvas do Fluxograma</h2>
                                    <div id="flux-statusMessage" class="status"></div>
                                    <div class="canvas-scroll" id="flux-canvasScroll">
                                        <div class="canvas-wrap" id="flux-canvasWrap">
                                            <canvas id="flux-canvas"></canvas>
                                            <textarea id="flux-nodeEditText" spellcheck="false"></textarea>
                                            <input id="flux-freeTextEdit" type="text" spellcheck="false" maxlength="80">
                                            <div id="flux-renderView"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="fab-wrap">
                            <button type="button" class="fab fab-add" onclick="addNode()" aria-label="Adicionar no">+</button>
                            <button type="button" class="fab sec" onclick="addTextLabel()" aria-label="Adicionar texto curto" title="Adicionar texto curto" style="font-size:1rem;font-weight:700;">T</button>
                            <button type="button" class="fab fab-link" onclick="toggleConnectionFromMenu()" aria-label="Conectar nos" title="Conectar nos">&#128279;</button>
                            <button type="button" class="fab fab-center" onclick="centerView()" aria-label="Centralizar visao">&#9678;</button>
                            <button type="button" class="fab fab-del" onclick="deleteNode()" aria-label="Apagar no selecionado">&#128465;</button>
                            <button type="button" class="fab fab-dl" onclick="exportToPNG()" aria-label="Baixar PNG">&#8681;</button>
                        </div>
                        <div id="flux-renameModal" class="modal">
                            <div>
                                <div style="font-size:1.08rem;font-weight:700;margin-bottom:.8rem">Renomear Projeto</div>
                                <input id="flux-projectNameInput" type="text" placeholder="Nome do projeto">
                                <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem">
                                    <button type="button" class="sec" onclick="closeRenameModal()">Cancelar</button>
                                    <button type="button" class="pri" onclick="saveProjectName()">Salvar</button>
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>`;
                try {
                    const mod = await import('./modulos/fluxograma/index.js');
                    const shell = await import('./modulos/fluxograma/cloudSync.js');
                    await shell.initFluxogramaApp(mod);
                } catch (err) {
                    console.error(err);
                    el.innerHTML = '<div class="app-error"><i class="fas fa-exclamation-triangle"></i> No foi possvel carregar o Fluxograma. Verifique o console.</div>';
                }
            }

            async renderCalendarioContent(el) {
                el.innerHTML = '<div class="app-error"><i class="fas fa-ban"></i> Modulo Agenda removido definitivamente.</div>';
            }

            renderListaComprasContent(el, data) {
                const rows = data.rows || data.itens || [];
                const categorias = ['Mantimentos', 'Higiene / limpeza', 'Feira', 'Carnes'];
                const LS_COLS = 'lista_compras_colunas_collapsed';
                let collapsedMap = {};
                try { collapsedMap = JSON.parse(localStorage.getItem(LS_COLS) || '{}'); } catch (e) { collapsedMap = {}; }
                const byCat = {};
                categorias.forEach((c) => { byCat[c] = []; });
                rows.forEach((r) => {
                    const c = categorias.includes(r.categoria) ? r.categoria : categorias[0];
                    byCat[c].push(r);
                });
                const itemRow = (r) => `
                    <li class="${r.comprado ? 'comprado' : ''}" data-id="${r.id}">
                        <div>
                            <input type="checkbox" class="app-checkbox lista-compras-chk" data-id="${r.id}" ${r.comprado ? 'checked' : ''} title="Comprado" />
                            <span class="item-text">${escapeHtml(r.item || '')}</span> ${r.quantidade > 1 ? ' x ' + r.quantidade : ''} ${r.unidade_medida ? escapeHtml(String(r.unidade_medida)) : ''}
                        </div>
                        <div class="app-list-actions">
                            <button type="button" data-action="lista-edit" data-id="${r.id}">Editar</button>
                            <button type="button" class="lista-btn-del" data-action="lista-delete-item" data-id="${r.id}">Excluir</button>
                        </div>
                    </li>`;
                const colsHtml = categorias.map((cat) => {
                    const items = byCat[cat];
                    const isCollapsed = collapsedMap[cat] === true;
                    const inner = items.length
                        ? items.map(itemRow).join('')
                        : '<li class="lista-compras-empty">Nenhum item nesta categoria.</li>';
                    const safeAttr = String(cat).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
                    return `<div class="lista-compras-col${isCollapsed ? ' is-collapsed' : ''}" data-lista-categoria="${safeAttr}">
                        <button type="button" class="lista-compras-col-head" aria-expanded="${!isCollapsed}">
                            <span class="lista-compras-col-title">${escapeHtml(cat)}</span>
                            <span class="lista-compras-col-badge">${items.length}</span>
                            <span class="lista-compras-col-chevron" aria-hidden="true">?</span>
                        </button>
                        <div class="lista-compras-col-body">
                            <ul class="app-list lista-compras-col-list">${inner}</ul>
                        </div>
                    </div>`;
                }).join('');
                el.innerHTML = `
                    <div class="app-form">
                        <input type="hidden" id="lista-edit-id" value="" />
                        <div class="app-form-row">
                            <div class="field"><label>Item</label><input type="text" id="lista-item" placeholder="Ex: Leite" /></div>
                            <div class="field"><label>Qtd</label><input type="number" min="1" id="lista-qtd" value="1" /></div>
                            <div class="field"><label>Unidade</label><select id="lista-unidade"><option value=""></option><option value="Kg">Kg</option><option value="L">L</option><option value="g">g</option><option value="UN">UN</option></select></div>
                            <div class="field"><label>Categoria</label><select id="lista-categoria">${categorias.map(c => '<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join('')}</select></div>
                        </div>
                        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center">
                            <button type="button" class="app-btn" data-action="lista-save">Adicionar</button>
                            <button type="button" class="app-btn app-btn-secondary" data-action="lista-cancel" style="display:none">Cancelar</button>
                            <button type="button" class="app-btn app-btn-secondary" data-action="lista-delete-all" style="background:#fef2f2;color:#dc2626;margin-left:auto">Apagar todos</button>
                        </div>
                    </div>
                    <div class="lista-compras-cols" id="lista-compras-cols">${colsHtml}</div>
                `;
                const clearListaForm = () => {
                    el.querySelector('#lista-edit-id').value = '';
                    el.querySelector('#lista-item').value = '';
                    el.querySelector('#lista-qtd').value = '1';
                    el.querySelector('#lista-unidade').value = '';
                    el.querySelector('[data-action="lista-save"]').textContent = 'Adicionar';
                    el.querySelector('[data-action="lista-cancel"]').style.display = 'none';
                };
                el.querySelector('[data-action="lista-save"]').onclick = () => this.submitListaSave(el, clearListaForm);
                el.querySelector('[data-action="lista-cancel"]').onclick = () => clearListaForm();
                el.querySelector('[data-action="lista-delete-all"]').onclick = () => this.submitListaDeleteAll(el);
                el.querySelectorAll('.lista-compras-col-head').forEach((btn) => {
                    btn.onclick = () => {
                        const col = btn.closest('.lista-compras-col');
                        const cat = col.getAttribute('data-lista-categoria') || '';
                        col.classList.toggle('is-collapsed');
                        const nowCollapsed = col.classList.contains('is-collapsed');
                        btn.setAttribute('aria-expanded', !nowCollapsed);
                        let m = {};
                        try { m = JSON.parse(localStorage.getItem(LS_COLS) || '{}'); } catch (e) { m = {}; }
                        m[cat] = nowCollapsed;
                        localStorage.setItem(LS_COLS, JSON.stringify(m));
                    };
                });
                el.querySelectorAll('.lista-compras-chk').forEach((chk) => {
                    chk.addEventListener('change', (e) => {
                        e.stopPropagation();
                        this.submitListaSetComprado(chk.dataset.id, chk.checked, el);
                    });
                });
                el.querySelectorAll('[data-action="lista-edit"]').forEach((btn) => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        const id = btn.dataset.id;
                        const r = rows.find((x) => String(x.id) === String(id));
                        if (!r) return;
                        el.querySelector('#lista-edit-id').value = id;
                        el.querySelector('#lista-item').value = r.item || '';
                        el.querySelector('#lista-qtd').value = r.quantidade || 1;
                        { const u = (r.unidade_medida || '').trim(); const opts = ['Kg', 'L', 'g', 'UN']; const hit = opts.find((o) => o.toLowerCase() === u.toLowerCase()); el.querySelector('#lista-unidade').value = hit || (opts.includes(u) ? u : ''); }
                        el.querySelector('#lista-categoria').value = categorias.includes(r.categoria) ? r.categoria : categorias[0];
                        el.querySelector('[data-action="lista-save"]').textContent = 'Salvar';
                        el.querySelector('[data-action="lista-cancel"]').style.display = '';
                        el.querySelector('#lista-item').focus();
                    };
                });
                el.querySelectorAll('[data-action="lista-delete-item"]').forEach((btn) => {
                    btn.onclick = (e) => { e.stopPropagation(); this.submitListaItemDelete(btn.dataset.id, el); };
                });
            }
            async submitListaSetComprado(id, comprado, el) {
                try {
                    const res = await fetch('/api/lista-compras', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, comprado }) });
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro'); }
                    await this.refreshAppContent('lista_compras');
                } catch (e) {
                    alert(e.message);
                    await this.refreshAppContent('lista_compras');
                }
            }
            async submitListaSave(el, clearListaForm) {
                const editId = (el.querySelector('#lista-edit-id').value || '').trim();
                const item = el.querySelector('#lista-item').value.trim();
                const quantidade = parseInt(el.querySelector('#lista-qtd').value, 10) || 1;
                const categoria = el.querySelector('#lista-categoria').value || 'Mantimentos';
                const unidade = (el.querySelector('#lista-unidade').value || '').trim();
                if (!item) { alert('Item Ã© obrigatÃ³rio'); return; }
                try {
                    if (editId) {
                        const res = await fetch('/api/lista-compras', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, item, quantidade, categoria, unidade_medida: unidade }) });
                        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro'); }
                    } else {
                        const res = await fetch('/api/lista-compras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item, quantidade, categoria, unidade_medida: unidade || undefined }) });
                        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro'); }
                    }
                    if (typeof clearListaForm === 'function') clearListaForm();
                    await this.refreshAppContent('lista_compras');
                } catch (e) { alert(e.message); }
            }
            async submitListaItemDelete(id, el) {
                if (!confirm('Excluir este item da lista?')) return;
                try {
                    const res = await fetch('/api/lista-compras', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro'); }
                    await this.refreshAppContent('lista_compras');
                } catch (e) { alert(e.message); }
            }
            async submitListaDeleteAll(el) {
                if (!confirm('Apagar TODOS os itens da lista? NÃ£o Ã© possÃ­vel desfazer.')) return;
                try {
                    const res = await fetch('/api/lista-compras', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delete_all: true }) });
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro'); }
                    await this.refreshAppContent('lista_compras');
                } catch (e) { alert(e.message); }
            }
            saudeFmtDataBR(d) {
                if (!d) return '';
                const s = String(d).slice(0, 10);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
                const [y, m, day] = s.split('-');
                return `${day}-${m}-${y}`;
            }
            saudeParseDataBR(v) {
                const t = (v || '').trim();
                if (!t) return null;
                if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
                const m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
                if (m) return `${m[3]}-${m[2]}-${m[1]}`;
                const m2 = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
                return null;
            }
            saudeFmtHora(h) {
                if (h == null || h === '') return '';
                const s = String(h).trim();
                return s.length >= 5 ? s.slice(0, 5) : s;
            }
            renderSaudeContent(el, data) {
                const rows = data.rows || data.registros || [];
                const tipos = ['Vacina', 'Exame', 'Consulta', 'Medicamento'];
                const LS_SAU = 'saude_colunas_collapsed';
                let collapsedMap = {};
                try { collapsedMap = JSON.parse(localStorage.getItem(LS_SAU) || '{}'); } catch (e) { collapsedMap = {}; }
                const byTipo = {};
                tipos.forEach((t) => { byTipo[t] = []; });
                rows.forEach((r) => {
                    const c = tipos.includes(r.tipo_registro) ? r.tipo_registro : 'Consulta';
                    byTipo[c].push(r);
                });
                tipos.forEach((t) => {
                    byTipo[t].sort((a, b) => {
                        const da = (a.data_evento || a.created_at || '').slice(0, 10);
                        const db = (b.data_evento || b.created_at || '').slice(0, 10);
                        return db.localeCompare(da);
                    });
                });
                delete el.dataset.saudeEditingId;
                el.innerHTML = `
                    <div class="app-form">
                        <div class="app-form-row">
                            <div class="field"><label>Membro</label><input type="text" id="saude-membro" placeholder="Nome" /></div>
                            <div class="field"><label>Tipo</label><select id="saude-tipo">${tipos.map((t) => '<option value="' + t + '">' + t + '</option>').join('')}</select></div>
                            <div class="field"><label>Detalhes</label><input type="text" id="saude-detalhes" placeholder="Ex: Dose 1" /></div>
                            <div class="field"><label>Data</label><input type="date" id="saude-data" autocomplete="off" /></div>
                            <div class="field"><label>Hora</label><input type="time" id="saude-hora" step="60" /></div>
                        </div>
                        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center">
                            <button type="button" class="app-btn" data-action="saude-submit">Registrar</button>
                            <button type="button" class="app-btn app-btn-secondary" data-action="saude-cancel" style="display:none">Cancelar</button>
                        </div>
                    </div>
                    <div class="lista-compras-cols" id="saude-cols"></div>
                `;
                const fmtDataBR = (d) => this.saudeFmtDataBR(d);
                const fmtHora = (h) => this.saudeFmtHora(h);
                const itemLi = (r, colTipo) => {
                    const dataBr = fmtDataBR(r.data_evento);
                    const hora = fmtHora(r.hora_evento);
                    const quando = [dataBr || null, hora ? 's ' + hora : null].filter(Boolean).join('  ');
                    const rotuloTipo = colTipo === 'Consulta' && r.tipo_registro && r.tipo_registro !== 'Consulta' ? ' <span style="font-size:0.75rem;color:#9ca3af">(' + escapeHtml(r.tipo_registro) + ')</span>' : '';
                    return `<li data-id="${escapeHtml(r.id || '')}">
                        <div><strong>${escapeHtml(r.membro_familia || '')}</strong>${rotuloTipo}${r.detalhes ? '  ' + escapeHtml(r.detalhes) : ''}${quando ? '<br/><span style="font-size:0.8rem;color:#9ca3af">' + escapeHtml(quando) + '</span>' : ''}</div>
                        <div class="app-list-actions">
                            <button type="button" data-action="saude-edit" data-id="${escapeHtml(r.id || '')}">Editar</button>
                            <button type="button" data-action="saude-delete" data-id="${escapeHtml(r.id || '')}" style="background:#fef2f2;color:#dc2626">Excluir</button>
                        </div>
                    </li>`;
                };
                const colsHtml = tipos.map((tipoNome) => {
                    const items = byTipo[tipoNome];
                    const isCollapsed = collapsedMap[tipoNome] === true;
                    const safeAttr = String(tipoNome).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
                    const inner = items.length
                        ? items.map((r) => itemLi(r, tipoNome)).join('')
                        : '<li class="lista-compras-empty">Nenhum registro.</li>';
                    return `<div class="lista-compras-col${isCollapsed ? ' is-collapsed' : ''}" data-saude-tipo="${safeAttr}">
                        <button type="button" class="lista-compras-col-head" aria-expanded="${!isCollapsed}">
                            <span class="lista-compras-col-title">${escapeHtml(tipoNome)}</span>
                            <span class="lista-compras-col-badge">${items.length}</span>
                            <span class="lista-compras-col-chevron" aria-hidden="true">?</span>
                        </button>
                        <div class="lista-compras-col-body"><ul class="app-list lista-compras-col-list">${inner}</ul></div>
                    </div>`;
                }).join('');
                el.querySelector('#saude-cols').innerHTML = colsHtml;
                const wireSaudeCol = (root) => {
                    root.querySelectorAll('[data-action="saude-edit"]').forEach((btn) => {
                        btn.onclick = () => this.saudeEdit(el, btn.dataset.id, rows);
                    });
                    root.querySelectorAll('[data-action="saude-delete"]').forEach((btn) => {
                        btn.onclick = () => this.submitSaudeDelete(btn.dataset.id, el);
                    });
                };
                wireSaudeCol(el.querySelector('#saude-cols'));
                el.querySelectorAll('#saude-cols .lista-compras-col-head').forEach((btn) => {
                    btn.onclick = () => {
                        const col = btn.closest('.lista-compras-col');
                        const tipo = col.getAttribute('data-saude-tipo') || '';
                        col.classList.toggle('is-collapsed');
                        const nowCollapsed = col.classList.contains('is-collapsed');
                        btn.setAttribute('aria-expanded', !nowCollapsed);
                        let m = {};
                        try { m = JSON.parse(localStorage.getItem(LS_SAU) || '{}'); } catch (e) { m = {}; }
                        m[tipo] = nowCollapsed;
                        localStorage.setItem(LS_SAU, JSON.stringify(m));
                    };
                });
                el.querySelector('[data-action="saude-submit"]').onclick = () => this.submitSaudeAdd(el);
                el.querySelector('[data-action="saude-cancel"]').onclick = () => this.saudeCancelForm(el);
            }
            saudeCancelForm(el) {
                const tiposStd = ['Vacina', 'Exame', 'Consulta', 'Medicamento'];
                const sel = el.querySelector('#saude-tipo');
                if (sel) sel.querySelectorAll('option').forEach((o) => { if (!tiposStd.includes(o.value)) o.remove(); });
                delete el.dataset.saudeEditingId;
                el.querySelector('#saude-membro').value = '';
                el.querySelector('#saude-tipo').value = 'Vacina';
                el.querySelector('#saude-detalhes').value = '';
                el.querySelector('#saude-data').value = '';
                const h = el.querySelector('#saude-hora');
                if (h) h.value = '';
                const btn = el.querySelector('[data-action="saude-submit"]');
                if (btn) btn.textContent = 'Registrar';
                const c = el.querySelector('[data-action="saude-cancel"]');
                if (c) c.style.display = 'none';
            }
            saudeEdit(el, id, rows) {
                const tiposStd = ['Vacina', 'Exame', 'Consulta', 'Medicamento'];
                const r = rows.find((x) => x.id === id) || rows.find((x) => x.id === String(id));
                if (!r) return;
                const sel = el.querySelector('#saude-tipo');
                sel.querySelectorAll('option').forEach((o) => {
                    if (!tiposStd.includes(o.value)) o.remove();
                });
                el.querySelector('#saude-membro').value = r.membro_familia || '';
                if (!tiposStd.includes(r.tipo_registro) && r.tipo_registro) {
                    const o = document.createElement('option');
                    o.value = r.tipo_registro;
                    o.textContent = r.tipo_registro;
                    sel.appendChild(o);
                }
                sel.value = r.tipo_registro || 'Vacina';
                el.querySelector('#saude-detalhes').value = r.detalhes || '';
                el.querySelector('#saude-data').value = r.data_evento ? String(r.data_evento).slice(0,10) : '';
                const hi = el.querySelector('#saude-hora');
                if (hi) hi.value = r.hora_evento ? this.saudeFmtHora(r.hora_evento) : '';
                el.dataset.saudeEditingId = id;
                const btn = el.querySelector('[data-action="saude-submit"]');
                if (btn) btn.textContent = 'Atualizar';
                const c = el.querySelector('[data-action="saude-cancel"]');
                if (c) c.style.display = '';
            }
            async submitSaudeAdd(el) {
                const membro_familia = el.querySelector('#saude-membro').value.trim();
                const tipo_registro = el.querySelector('#saude-tipo').value;
                const detalhes = (el.querySelector('#saude-detalhes').value || '').trim();
                const data_evento = (el.querySelector('#saude-data').value || '').trim() || null;
                if (data_evento && !/^\d{4}-\d{2}-\d{2}$/.test(data_evento)) {
                    alert('Data invlida.');
                    return;
                }
                const horaVal = (el.querySelector('#saude-hora') && el.querySelector('#saude-hora').value) || '';
                const hora_evento = horaVal.trim() ? horaVal.trim().slice(0, 5) : null;
                if (!membro_familia) { alert('Membro Ã© obrigatÃ³rio'); return; }
                const editingId = el.dataset.saudeEditingId;
                try {
                    if (editingId) {
                        const res = await fetch('/api/saude', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, membro_familia, tipo_registro, detalhes, data_evento, hora_evento }) });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Erro ao atualizar');
                        this.saudeCancelForm(el);
                    } else {
                        const res = await fetch('/api/saude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ membro_familia, tipo_registro, detalhes, data_evento, hora_evento: hora_evento || undefined }) });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
                        
                        el.querySelector('#saude-membro').value = '';
                        el.querySelector('#saude-tipo').value = 'Vacina';
                        el.querySelector('#saude-detalhes').value = '';
                        el.querySelector('#saude-data').value = '';
                        if (el.querySelector('#saude-hora')) el.querySelector('#saude-hora').value = '';
                    }
                    await this.refreshAppContent('saude');
                    this.refreshEventNotifications();
                } catch (e) { alert(e.message); }
            }
            async submitSaudeDelete(id, el) {
                if (!id) return;
                if (!confirm('Excluir este registro? NÃ£o Ã© possÃ­vel desfazer.')) return;
                try {
                    const res = await fetch('/api/saude', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao excluir'); }
                    if (el.dataset.saudeEditingId === id) this.saudeCancelForm(el);
                    await this.refreshAppContent('saude');
                    this.refreshEventNotifications();
                } catch (e) { alert(e.message); }
            }

            getBrazilDateIsoFrom(dateInput) {
                const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
                const fmt = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'America/Sao_Paulo',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
                return fmt.format(d);
            }
            getBrazilNowDateTime() {
                const fmt = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'America/Sao_Paulo',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
                const parts = fmt.formatToParts(new Date());
                const map = {};
                parts.forEach((p) => { map[p.type] = p.value; });
                return {
                    date: `${map.year}-${map.month}-${map.day}`,
                    time: `${map.hour}:${map.minute}`
                };
            }
            addDaysToIso(isoDate, amount) {
                const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (!m) return isoDate;
                const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
                dt.setUTCDate(dt.getUTCDate() + amount);
                return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
            }
            normalizeIsoDate(v) {
                const t = String(v || '').trim();
                if (!t) return null;
                if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
                const br = t.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
                if (br) return `${br[3]}-${br[2]}-${br[1]}`;
                return null;
            }
            notificationItemKey(item) {
                return [item?.source || '', item?.date || '', item?.time || '', item?.title || '', item?.details || ''].join('||');
            }
            loadDismissedNotifications(targetDate) {
                let parsed = null;
                try {
                    const raw = localStorage.getItem(this.NOTIFICATION_DISMISS_KEY);
                    parsed = raw ? JSON.parse(raw) : null;
                } catch (e) {
                    parsed = null;
                }
                if (parsed && parsed.targetDate === targetDate && Array.isArray(parsed.keys)) {
                    this.notificationDismissed = { targetDate, keys: parsed.keys };
                    return;
                }
                this.notificationDismissed = { targetDate, keys: [] };
                this.saveDismissedNotifications();
            }
            saveDismissedNotifications() {
                try {
                    localStorage.setItem(this.NOTIFICATION_DISMISS_KEY, JSON.stringify(this.notificationDismissed));
                } catch (e) {}
            }
            clearEventNotifications() {
                const currentItems = this.notificationItems || [];
                const currentKeys = currentItems.map((item) => this.notificationItemKey(item));
                const merged = new Set([...(this.notificationDismissed.keys || []), ...currentKeys]);
                this.notificationDismissed.keys = Array.from(merged);
                this.saveDismissedNotifications();
                this.notificationItems = [];
                this.refreshNotificationBadge();
            }
            startNotificationCenter() {
                this.refreshEventNotifications();
                if (this.notificationTimer) clearInterval(this.notificationTimer);
                this.notificationTimer = setInterval(() => this.refreshEventNotifications(), 5 * 60 * 1000);
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') this.refreshEventNotifications();
                });
            }
            async buildSaudeNotificationItems(targetDate) {
                const res = await fetch('/api/saude');
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Falha ao carregar saÃºde familiar');
                const rows = data.rows || data.registros || [];
                const due = rows.filter((r) => this.normalizeIsoDate(r.data_evento) === targetDate);
                return due.map((r) => ({
                    source: 'saude',
                    date: targetDate,
                    time: (r.hora_evento || '').slice(0, 5),
                    title: (r.tipo_registro || 'Registro') + ' - ' + (r.membro_familia || 'Familiar'),
                    details: r.detalhes || ''
                }));
            }
            async refreshEventNotifications() {
                const today = this.getBrazilDateIsoFrom(new Date());
                const tomorrow = this.addDaysToIso(today, 1);
                this.loadDismissedNotifications(tomorrow);
                try {
                    const saudeItems = await this.buildSaudeNotificationItems(tomorrow);
                    const dismissed = new Set(this.notificationDismissed.keys || []);
                    this.notificationItems = [...saudeItems]
                        .filter((item) => !dismissed.has(this.notificationItemKey(item)))
                        .sort((a, b) => {
                        const ta = (a.time || '23:59');
                        const tb = (b.time || '23:59');
                        if (ta === tb) return a.source.localeCompare(b.source);
                        return ta.localeCompare(tb);
                    });
                } catch (err) {
                    console.error('Erro ao carregar notificaÃ§Ãµes de eventos:', err);
                    this.notificationItems = [];
                }
                this.refreshNotificationBadge();
            }
            refreshNotificationBadge() {
                const badge = document.getElementById('notificationBadge');
                if (!badge) return;
                const pwaPending = window._superappPwaUpdatePending === true;
                const hasEvents = (this.notificationItems || []).length > 0;
                if (pwaPending || hasEvents) badge.classList.add('visible');
                else badge.classList.remove('visible');
            }
            formatDateBr(isoDate) {
                const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (!m) return isoDate || '';
                return `${m[3]}/${m[2]}/${m[1]}`;
            }
            openNotificationsModal() {
                const items = [...(this.notificationItems || [])];
                const hasEventItems = items.length > 0;
                if (window._superappPwaUpdatePending === true) {
                    items.unshift({
                        source: 'sistema',
                        date: '',
                        time: '',
                        title: 'Nova versÃ£o do app disponÃ­vel',
                        details: 'Use o botÃ£o Atualizar no aviso exibido na tela.'
                    });
                }
                const overlay = document.createElement('div');
                overlay.className = 'app-modal-overlay';
                const content = items.length
                    ? `<ul class="app-list" style="max-height:50vh;overflow:auto;border:1px solid var(--border-color);border-radius:8px;">
                        ${items.map((item, idx) => {
                            const modulo = item.source === 'saude' ? 'SaÃºde familiar' : 'Sistema';
                            const quando = [this.formatDateBr(item.date), item.time].filter(Boolean).join(' - ');
                            const detalhes = [modulo, quando, item.details].filter(Boolean).join(' | ');
                            return `<li><div><strong>${idx + 1}. ${escapeHtml(item.title || '')}</strong><br/><span style="font-size:0.8rem;color:#9ca3af;">${escapeHtml(detalhes)}</span></div></li>`;
                        }).join('')}
                       </ul>`
                    : '<p style="font-size:0.9rem;color:var(--text-light);">Nenhum evento para amanhÃ£.</p>';
                overlay.innerHTML = `
                    <div class="app-modal" style="width:min(680px,calc(100vw - 2rem));">
                        <h4>NotificaÃ§Ãµes de eventos</h4>
                        ${content}
                        <div class="app-modal-actions">
                            ${hasEventItems ? '<button type="button" class="app-btn app-btn-secondary" data-action="clear-notifications">Limpar notificaÃ§Ãµes</button>' : ''}
                            <button type="button" class="app-btn app-btn-secondary" data-action="close-notifications">Fechar</button>
                        </div>
                    </div>
                `;
                if (hasEventItems) {
                    overlay.querySelector('[data-action="clear-notifications"]').onclick = () => {
                        this.clearEventNotifications();
                        overlay.remove();
                    };
                }
                overlay.querySelector('[data-action="close-notifications"]').onclick = () => overlay.remove();
                overlay.onclick = (evt) => { if (evt.target === overlay) overlay.remove(); };
                document.body.appendChild(overlay);
            }

            closeWindow(windowId) {
                const element = document.getElementById(windowId);
                if (element) {
                    const contentEl = element.querySelector('.window-content');
                    if (contentEl && contentEl._mesCheckInterval) clearInterval(contentEl._mesCheckInterval);
                    if (contentEl && typeof contentEl._cleanup === 'function') contentEl._cleanup();
                    const fluxRoot = contentEl && contentEl.querySelector('#fluxograma-root');
                    if (fluxRoot && fluxRoot._fluxOnResize) {
                        window.removeEventListener('resize', fluxRoot._fluxOnResize);
                    }
                    element.remove();
                    const appId = windowId.replace('window-', '');
                    this.openWindows.delete(appId);
                    this.updateStatistics();
                }
            }

            goHome(windowId) {
                this.closeWindow(windowId);
                const appsEl = document.getElementById('apps');
                if (appsEl) appsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            updateStatistics() {
                this.statistics.openApps = this.openWindows.size;
                this.renderDashboardCharts();
            }

            // ============================================
            // MÃ‰TODOS PARA INTEGRAÃ‡ÃƒO COM BACKEND
            // ============================================
            
            /**
             * MÃ©todo para vocÃª chamar quando receber dados do backend
             * Exemplo: superApp.setApps(dataFromBackend)
             */
            setApps(apps) {
                this.apps = apps;
                this.renderApps();
            }

            /**
             * MÃ©todo para vocÃª chamar quando receber estatÃ­sticas do backend
             * Exemplo: superApp.setStatistics(statsFromBackend)
             */
            setStatistics(stats) {
                this.statistics = { ...stats, openApps: this.openWindows.size };
                this.renderDashboardCharts();
            }

            /**
             * MÃ©todo para vocÃª chamar quando receber roadmap do backend
             * Exemplo: superApp.setRoadmap(roadmapFromBackend)
             */
            setRoadmap(roadmap) {
                this.roadmap = roadmap;
                this.renderRoadmap();
            }
        }

        // Inicializar SUPERAPP
        const superApp = new SuperApp();
        window._superappPwaUpdatePending = false;

        // ============================================
        // EXEMPLO DE COMO INTEGRAR COM BACKEND
        // ============================================
        
        /*
        // Exemplo 1: Carregar dados quando pÃ¡gina carrega
        window.addEventListener('load', async () => {
            try {
                const [appsRes, statsRes, roadmapRes] = await Promise.all([
                    fetch('/api/apps'),
                    fetch('/api/statistics'),
                    fetch('/api/roadmap')
                ]);

                const apps = await appsRes.json();
                const stats = await statsRes.json();
                const roadmap = await roadmapRes.json();

                superApp.setApps(apps);
                superApp.setStatistics(stats);
                superApp.setRoadmap(roadmap);
            } catch (error) {
                console.error('Erro ao carregar dados:', error);
            }
        });

        // Exemplo 2: Atualizar dados a cada 30 segundos
        setInterval(async () => {
            try {
                const response = await fetch('/api/statistics');
                const stats = await response.json();
                superApp.setStatistics(stats);
            } catch (error) {
                console.error('Erro ao atualizar estatÃ­sticas:', error);
            }
        }, 30000);

        // Exemplo 3: Usar WebSocket para atualizaÃ§Ãµes em tempo real
        const ws = new WebSocket('ws://seu-backend.com/api/updates');
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'apps') superApp.setApps(data.payload);
            if (data.type === 'statistics') superApp.setStatistics(data.payload);
            if (data.type === 'roadmap') superApp.setRoadmap(data.payload);
        };
        */

        // PWA: instalaÃ§Ã£o no mobile como app (nÃ£o Ã© atalho)
        let deferredInstallPrompt = null;
        const pwaInstallBtn = document.getElementById('pwaInstallBtn');
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints && window.innerWidth < 1024);
        function updateInstallButton() {
            if (!pwaInstallBtn) return;
            if (isStandalone) { pwaInstallBtn.style.display = 'none'; return; }
            if (deferredInstallPrompt || isMobile) pwaInstallBtn.style.display = 'block';
        }
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            updateInstallButton();
        });
        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            if (pwaInstallBtn) pwaInstallBtn.style.display = 'none';
        });
        if (pwaInstallBtn) {
            pwaInstallBtn.addEventListener('click', async () => {
                if (deferredInstallPrompt) {
                    deferredInstallPrompt.prompt();
                    const { outcome } = await deferredInstallPrompt.userChoice;
                    deferredInstallPrompt = null;
                    if (pwaInstallBtn) pwaInstallBtn.style.display = 'none';
                } else if (isMobile) {
                    alert('Para instalar como app:\n\n1. Toque no menu do navegador (â‹® ou â˜°)\n2. Escolha "Instalar app" ou "Adicionar Ã  tela inicial"\n\nUse "Instalar app" para abrir em tela cheia, como aplicativo.');
                }
            });
        }
        updateInstallButton();

        // PWA: registrar SW, detectar mudanÃ§a de versÃ£o (deploy) e atualizar cache
        if ('serviceWorker' in navigator) {
            let pendingWorker = null;
            const banner = document.createElement('div');
            banner.className = 'pwa-update-banner hidden';
            banner.innerHTML = '<span>Nova verso disponvel.</span><button type="button">Atualizar</button>';
            document.body.appendChild(banner);
            const btn = banner.querySelector('button');
            btn.addEventListener('click', () => {
                if (pendingWorker) pendingWorker.postMessage({ type: 'SKIP_WAITING' });
                banner.classList.add('hidden');
                window._superappPwaUpdatePending = false;
                superApp.refreshNotificationBadge();
            });

            function showUpdateBanner(worker) {
                pendingWorker = worker;
                banner.classList.remove('hidden');
                window._superappPwaUpdatePending = true;
                superApp.refreshNotificationBadge();
            }

            navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateBanner(newWorker);
                        }
                    });
                });
                // Verificar nova verso periodicamente e ao voltar para o app
                setInterval(() => reg.update(), 60 * 1000);
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') reg.update();
                });
            });
            navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
        }
    
