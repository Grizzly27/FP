// ===========================
// Storage Manager
// ===========================
const StorageManager = {
    KEYS: {
        MEMBERS: 'familypulse_members',
        TASKS: 'familypulse_tasks',
        SETUP_COMPLETE: 'familypulse_setup_complete'
    },

    // Members
    getMembers() {
        const data = localStorage.getItem(this.KEYS.MEMBERS);
        return data ? JSON.parse(data) : [];
    },

    saveMember(member) {
        const members = this.getMembers();
        const now = Date.now();

        if (member.id) {
            const index = members.findIndex(m => m.id === member.id);
            if (index !== -1) {
                members[index] = {
                    ...members[index],
                    ...member,
                    color: member.color || members[index].color || this.generateColor(index),
                    lastModified: now
                };
            }
        } else {
            member.id = Date.now().toString();
            member.color = this.generateColor(members.length);
            member.lastModified = now;
            members.push(member);
        }

        localStorage.setItem(this.KEYS.MEMBERS, JSON.stringify(members));
        if (typeof SheetBackend !== 'undefined') {
            SheetBackend.triggerSync();
        }
        return member;
    },

    deleteMember(id) {
        const members = this.getMembers().filter(m => m.id !== id);
        localStorage.setItem(this.KEYS.MEMBERS, JSON.stringify(members));
        // Also delete tasks for this member
        const tasks = this.getTasks().filter(t => t.memberId !== id);
        localStorage.setItem(this.KEYS.TASKS, JSON.stringify(tasks));
        if (typeof SheetBackend !== 'undefined') {
            SheetBackend.triggerSync();
        }
    },

    // Tasks
    getTasks() {
        const data = localStorage.getItem(this.KEYS.TASKS);
        return data ? JSON.parse(data) : [];
    },

    saveTask(task) {
        const tasks = this.getTasks();
        const now = Date.now();

        if (task.id) {
            const index = tasks.findIndex(t => t.id === task.id);
            if (index !== -1) {
                tasks[index] = {
                    ...tasks[index],
                    ...task,
                    lastModified: now
                };
            }
        } else {
            task.id = Date.now().toString();
            task.lastModified = now;
            tasks.push(task);
        }

        localStorage.setItem(this.KEYS.TASKS, JSON.stringify(tasks));
        if (typeof SheetBackend !== 'undefined') {
            SheetBackend.triggerSync();
        }
        return task;
    },

    deleteTask(id) {
        const tasks = this.getTasks().filter(t => t.id !== id);
        localStorage.setItem(this.KEYS.TASKS, JSON.stringify(tasks));
        if (typeof SheetBackend !== 'undefined') {
            SheetBackend.triggerSync();
        }
    },

    // Setup
    isSetupComplete() {
        return localStorage.getItem(this.KEYS.SETUP_COMPLETE) === 'true';
    },

    completeSetup() {
        localStorage.setItem(this.KEYS.SETUP_COMPLETE, 'true');
    },

    // Utilities
    generateColor(index) {
        const colors = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
        return colors[index % colors.length];
    },

    // Export/Import
    exportData() {
        return {
            members: this.getMembers(),
            tasks: this.getTasks(),
            exportDate: new Date().toISOString()
        };
    },

    importData(data) {
        if (data.members) localStorage.setItem(this.KEYS.MEMBERS, JSON.stringify(data.members));
        if (data.tasks) localStorage.setItem(this.KEYS.TASKS, JSON.stringify(data.tasks));
        if (typeof SheetBackend !== 'undefined') {
            SheetBackend.triggerSync();
        }
    }
};

// ===========================
// Utility
// ===========================
function debounce(func, wait) {
    let timeout;

    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// ===========================
// Google Sheets Backend
// ===========================
const SheetBackend = {
    KEYS: {
        SCRIPT_URL: 'familypulse_sheet_script_url',
        LAST_SYNC_TIME: 'familypulse_last_sync_time'
    },
    scriptUrl: '',
    lastSyncTime: '',
    syncInProgress: false,
    debouncedSync: null,

    init() {
        this.scriptUrl = localStorage.getItem(this.KEYS.SCRIPT_URL) || '';
        this.lastSyncTime = localStorage.getItem(this.KEYS.LAST_SYNC_TIME) || '';
        this.debouncedSync = debounce(() => this.sync('background'), 3000);
        this.updateStatus(this.scriptUrl ? 'idle' : 'unconfigured');
    },

    isConfigured() {
        return !!this.scriptUrl;
    },

    setUrl(url) {
        this.scriptUrl = (url || '').trim();

        if (this.scriptUrl) {
            localStorage.setItem(this.KEYS.SCRIPT_URL, this.scriptUrl);
            this.updateStatus('idle');
        } else {
            localStorage.removeItem(this.KEYS.SCRIPT_URL);
            this.updateStatus('unconfigured');
        }
    },

    triggerSync() {
        if (!this.isConfigured() || !this.debouncedSync) return;
        this.debouncedSync();
    },

    getItemTimestamp(item) {
        const explicitTs = Number(item?.lastModified);
        if (Number.isFinite(explicitTs) && explicitTs > 0) return explicitTs;

        const idTs = Number(item?.id);
        if (Number.isFinite(idTs) && idTs > 0) return idTs;

        return 0;
    },

    ensureTimestamp(item) {
        if (!item) return item;
        if (item.lastModified) return item;
        return {
            ...item,
            lastModified: this.getItemTimestamp(item) || Date.now()
        };
    },

    mergeById(localItems = [], remoteItems = []) {
        const merged = new Map();

        [...remoteItems, ...localItems].forEach(item => {
            if (!item?.id) return;
            const normalized = this.ensureTimestamp(item);
            const existing = merged.get(normalized.id);

            if (!existing) {
                merged.set(normalized.id, normalized);
                return;
            }

            const existingTs = this.getItemTimestamp(existing);
            const incomingTs = this.getItemTimestamp(normalized);
            if (incomingTs >= existingTs) {
                merged.set(normalized.id, normalized);
            }
        });

        return Array.from(merged.values());
    },

    sanitizeMembersForSync(members) {
        return members.map(member => {
            const safeMember = { ...member };
            if (typeof safeMember.photo === 'string' && safeMember.photo.length > 45000) {
                safeMember.photo = '';
            }
            return safeMember;
        });
    },

    async fetchRemoteData() {
        const response = await fetch(this.scriptUrl, {
            method: 'GET',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`GET failed (${response.status})`);
        }

        const payload = await response.json();
        return {
            members: Array.isArray(payload.members) ? payload.members : [],
            tasks: Array.isArray(payload.tasks) ? payload.tasks : []
        };
    },

    async pushRemoteData(data) {
        const response = await fetch(this.scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`POST failed (${response.status})`);
        }
    },

    setLastSynced(ts = Date.now()) {
        this.lastSyncTime = String(ts);
        localStorage.setItem(this.KEYS.LAST_SYNC_TIME, this.lastSyncTime);
    },

    formatLastSynced() {
        if (!this.lastSyncTime) return 'Never';

        const parsed = Number(this.lastSyncTime);
        const date = new Date(Number.isFinite(parsed) && parsed > 0 ? parsed : this.lastSyncTime);

        if (Number.isNaN(date.getTime())) return 'Never';
        return date.toLocaleString();
    },

    updateStatus(state, message = '') {
        const indicator = document.getElementById('syncIndicator');
        const messageEl = document.getElementById('syncMessage');
        const lastSyncedEl = document.getElementById('syncLastSynced');

        const defaultMessage = {
            unconfigured: 'Add your Google Apps Script URL to enable sync',
            idle: 'Ready to sync',
            syncing: 'Syncing…',
            success: 'Synced successfully',
            error: 'Sync failed'
        };

        if (indicator) {
            indicator.className = `sync-indicator ${state}`;
        }

        if (messageEl) {
            messageEl.textContent = message || defaultMessage[state] || 'Ready';
        }

        if (lastSyncedEl) {
            lastSyncedEl.textContent = `Last synced: ${this.formatLastSynced()}`;
        }
    },

    async testConnection() {
        if (!this.isConfigured()) {
            this.updateStatus('unconfigured');
            return false;
        }

        this.updateStatus('syncing', 'Testing connection…');

        try {
            await this.fetchRemoteData();
            this.updateStatus('idle', 'Connection successful');
            return true;
        } catch (error) {
            this.updateStatus('error', `Connection failed: ${error.message || 'Unknown error'}`);
            return false;
        }
    },

    async sync(mode = 'manual') {
        if (!this.isConfigured()) {
            this.updateStatus('unconfigured');
            return false;
        }

        if (this.syncInProgress) return false;

        this.syncInProgress = true;
        this.updateStatus('syncing', mode === 'background' ? 'Syncing in background…' : 'Syncing…');

        try {
            const localMembers = StorageManager.getMembers().map(member => this.ensureTimestamp(member));
            const localTasks = StorageManager.getTasks().map(task => this.ensureTimestamp(task));

            const remoteData = await this.fetchRemoteData();
            const remoteMembers = remoteData.members.map(member => this.ensureTimestamp(member));
            const remoteTasks = remoteData.tasks.map(task => this.ensureTimestamp(task));

            const mergedMembers = this.mergeById(localMembers, remoteMembers);
            const mergedTasks = this.mergeById(localTasks, remoteTasks);

            // Update local first (offline-first cache)
            localStorage.setItem(StorageManager.KEYS.MEMBERS, JSON.stringify(mergedMembers));
            localStorage.setItem(StorageManager.KEYS.TASKS, JSON.stringify(mergedTasks));

            // Push merged truth back to sheet
            await this.pushRemoteData({
                members: this.sanitizeMembersForSync(mergedMembers),
                tasks: mergedTasks
            });

            this.setLastSynced(Date.now());
            this.updateStatus('success');

            // Refresh UI
            TaskUI.render();
            ChartManager.update();
            StatsUI.update();
            SetupUI.renderSetupList();
            SetupUI.renderSettingsList();

            return true;
        } catch (error) {
            console.error('Sheet sync failed:', error);
            this.updateStatus('error', `Sync failed: ${error.message || 'Unknown error'}`);
            return false;
        } finally {
            this.syncInProgress = false;
        }
    }
};

// ===========================
// Chart Manager
// ===========================
const ChartManager = {
    chart: null,
    mode: 'daily', // 'daily' or 'cumulative'

    init() {
        const ctx = document.getElementById('taskChart');
        if (!ctx) return;

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    datalabels: {
                        display: false // Disable default datalabels, we'll use custom plugin
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: {
                            size: 14,
                            weight: 'bold'
                        },
                        bodyFont: {
                            size: 13
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: {
                                size: 11,
                                weight: '500'
                            },
                            color: '#64748B'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#E2E8F0',
                            drawBorder: false
                        },
                        ticks: {
                            font: {
                                size: 11,
                                weight: '500'
                            },
                            color: '#64748B',
                            precision: 0
                        }
                    }
                },
                elements: {
                    line: {
                        tension: 0.4, // Smooth curves
                        borderWidth: 3
                    },
                    point: {
                        radius: 0, // Hide default points, we'll draw photos instead
                        hoverRadius: 0
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                layout: {
                    padding: {
                        top: 40, // Extra space for photos above the chart
                        right: 40 // Extra space for end-of-line avatars
                    }
                }
            },
            plugins: [{
                id: 'photoDataLabels',
                afterDatasetsDraw: (chart) => {
                    const ctx = chart.ctx;
                    const members = StorageManager.getMembers();

                    // Track positions to handle overlaps
                    const positionMap = {}; // key: "x,y", value: count of items at this position

                    chart.data.datasets.forEach((dataset, datasetIndex) => {
                        const member = members.find(m => m.id === dataset.memberId);
                        if (!member || !member.photo) return;

                        const meta = chart.getDatasetMeta(datasetIndex);

                        // Load member photo
                        const img = new Image();
                        img.src = member.photo;

                        // Draw photo on each data point (except zeros)
                        dataset.data.forEach((value, index) => {
                            if (value === 0) return; // Skip zeros

                            const point = meta.data[index];
                            if (!point) return;

                            const x = point.x;
                            let y = point.y;

                            // Check for overlaps and adjust y position
                            const posKey = `${Math.round(x)},${Math.round(y)}`;
                            const overlapCount = positionMap[posKey] || 0;
                            positionMap[posKey] = overlapCount + 1;

                            // Offset y position if there's overlap
                            const yOffset = overlapCount * 35; // Stack vertically with 35px spacing
                            y = y - yOffset;

                            const photoRadius = 14;

                            // Draw photo circle
                            ctx.save();
                            ctx.beginPath();
                            ctx.arc(x, y, photoRadius, 0, Math.PI * 2);
                            ctx.closePath();
                            ctx.clip();
                            ctx.drawImage(img, x - photoRadius, y - photoRadius, photoRadius * 2, photoRadius * 2);
                            ctx.restore();

                            // Draw border around photo
                            ctx.beginPath();
                            ctx.arc(x, y, photoRadius, 0, Math.PI * 2);
                            ctx.strokeStyle = dataset.borderColor;
                            ctx.lineWidth = 2.5;
                            ctx.stroke();

                            // Draw white background circle for the count
                            ctx.beginPath();
                            ctx.arc(x, y + photoRadius + 10, 10, 0, Math.PI * 2);
                            ctx.fillStyle = 'white';
                            ctx.fill();
                            ctx.strokeStyle = dataset.borderColor;
                            ctx.lineWidth = 2;
                            ctx.stroke();

                            // Draw count text below photo
                            ctx.fillStyle = dataset.borderColor;
                            ctx.font = 'bold 11px Inter, sans-serif';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(value, x, y + photoRadius + 10);
                        });
                    });
                }
            }, {
                id: 'avatarPlugin',
                afterDatasetsDraw: (chart) => {
                    const ctx = chart.ctx;
                    const members = StorageManager.getMembers();

                    chart.data.datasets.forEach((dataset, i) => {
                        const member = members.find(m => m.id === dataset.memberId);
                        if (!member || !member.photo) return;

                        const meta = chart.getDatasetMeta(i);
                        if (!meta.data.length) return;

                        const lastPoint = meta.data[meta.data.length - 1];
                        const x = lastPoint.x + 25;
                        const y = lastPoint.y;

                        // Draw avatar circle at end of line
                        const img = new Image();
                        img.src = member.photo;

                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(x, y, 16, 0, Math.PI * 2);
                        ctx.closePath();
                        ctx.clip();
                        ctx.drawImage(img, x - 16, y - 16, 32, 32);
                        ctx.restore();

                        // Draw border
                        ctx.beginPath();
                        ctx.arc(x, y, 16, 0, Math.PI * 2);
                        ctx.strokeStyle = dataset.borderColor;
                        ctx.lineWidth = 3;
                        ctx.stroke();
                    });
                }
            }]
        });
    },

    update() {
        if (!this.chart) return;

        const members = StorageManager.getMembers();
        const tasks = StorageManager.getTasks();

        // Generate date range: first task date to today + 7 days
        const dates = this.generateDateRange(tasks);

        // Build datasets
        const datasets = members.map(member => {
            const data = dates.map(date => {
                const dayTasks = tasks.filter(t =>
                    t.memberId === member.id &&
                    t.date === date
                );
                return dayTasks.length;
            });

            // Convert to cumulative if needed
            const finalData = this.mode === 'cumulative'
                ? this.toCumulative(data)
                : data;

            return {
                label: member.name,
                data: finalData,
                borderColor: member.color,
                backgroundColor: member.color + '20',
                memberId: member.id,
                fill: false
            };
        });

        this.chart.data.labels = dates.map(d => this.formatDate(d));
        this.chart.data.datasets = datasets;
        this.chart.update();
    },

    generateDateRange(tasks) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let startDate = new Date(today);

        // Find earliest task date
        if (tasks.length > 0) {
            const taskDates = tasks.map(t => new Date(t.date));
            const earliest = new Date(Math.min(...taskDates));
            if (earliest < startDate) {
                startDate = earliest;
            }
        }

        // End date is today + 7 days
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 7);

        // Generate array of dates
        const dates = [];
        const current = new Date(startDate);
        while (current <= endDate) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }

        return dates;
    },

    toCumulative(data) {
        const cumulative = [];
        let sum = 0;
        for (const value of data) {
            sum += value;
            cumulative.push(sum);
        }
        return cumulative;
    },

    formatDate(dateStr) {
        const date = new Date(dateStr);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${month}/${day}`;
    },

    setMode(mode) {
        this.mode = mode;
        this.update();
    }
};

// ===========================
// Task UI Manager
// ===========================
const TaskUI = {
    currentTask: null,

    init() {
        // Modal controls
        document.getElementById('addTaskBtn').addEventListener('click', () => this.openModal());
        document.getElementById('fabAddTask').addEventListener('click', () => this.openModal());
        document.getElementById('closeTaskModal').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelTaskBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('saveTaskBtn').addEventListener('click', () => this.saveTask());

        // Set default date to today
        document.getElementById('taskDate').valueAsDate = new Date();

        this.render();
        this.initQuickAdd();
    },

    openModal(task = null) {
        this.currentTask = task;
        const modal = document.getElementById('taskModal');
        const title = document.getElementById('taskModalTitle');

        if (task) {
            title.textContent = 'Edit Task';
            document.getElementById('taskMemberId').value = task.memberId;
            document.getElementById('taskName').value = task.name;
            document.getElementById('taskDate').value = task.date;
            document.getElementById('taskTime').value = task.time || '';
            document.getElementById('taskRecurrence').value = task.recurrence || 'none';
        } else {
            title.textContent = 'Add Task';
            document.getElementById('taskName').value = '';
            document.getElementById('taskDate').valueAsDate = new Date();
            document.getElementById('taskTime').value = '';
            document.getElementById('taskRecurrence').value = 'none';
        }

        // Populate member dropdown
        const memberSelect = document.getElementById('taskMemberId');
        memberSelect.innerHTML = StorageManager.getMembers()
            .map(m => `<option value="${m.id}">${m.name}</option>`)
            .join('');

        modal.classList.add('active');
    },

    closeModal() {
        document.getElementById('taskModal').classList.remove('active');
        this.currentTask = null;
    },

    saveTask() {
        const task = {
            id: this.currentTask?.id,
            memberId: document.getElementById('taskMemberId').value,
            name: document.getElementById('taskName').value.trim(),
            date: document.getElementById('taskDate').value,
            time: document.getElementById('taskTime').value,
            recurrence: document.getElementById('taskRecurrence').value
        };

        if (!task.name) {
            alert('Please enter a task name');
            return;
        }

        StorageManager.saveTask(task);
        this.closeModal();
        this.render();
        ChartManager.update();
        StatsUI.update();
    },

    deleteTask(id) {
        if (confirm('Delete this task?')) {
            StorageManager.deleteTask(id);
            this.render();
            ChartManager.update();
            StatsUI.update();
        }
    },

    render() {
        const container = document.getElementById('tasksList');
        const tasks = StorageManager.getTasks();
        const members = StorageManager.getMembers();

        if (tasks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <div class="empty-state-text">No tasks yet. Tap + to add one!</div>
                </div>
            `;
            return;
        }

        // Group by date (descending)
        const grouped = {};
        tasks.forEach(task => {
            if (!grouped[task.date]) grouped[task.date] = [];
            grouped[task.date].push(task);
        });

        const sortedDates = Object.keys(grouped).sort().reverse();

        container.innerHTML = sortedDates.map(date => {
            const dateTasks = grouped[date];
            return `
                <div class="task-group">
                    <div class="task-group-header">${this.formatDateHeader(date)}</div>
                    ${dateTasks.map(task => {
                const member = members.find(m => m.id === task.memberId);
                return `
                            <div class="task-item">
                                ${member?.photo ? `<img src="${member.photo}" class="task-avatar" alt="${member.name}">` : ''}
                                <div class="task-info">
                                    <div class="task-name">${task.name}</div>
                                    <div class="task-meta">
                                        ${member?.name || 'Unknown'} 
                                        ${task.time ? `• ${task.time}` : ''}
                                        ${task.recurrence !== 'none' ? `• ${task.recurrence}` : ''}
                                    </div>
                                </div>
                                <div class="task-actions">
                                    <button class="task-action-btn" onclick="TaskUI.openModal(${JSON.stringify(task).replace(/"/g, '&quot;')})">✏️</button>
                                    <button class="task-action-btn delete" onclick="TaskUI.deleteTask('${task.id}')">🗑️</button>
                                </div>
                            </div>
                        `;
            }).join('')}
                </div>
            `;
        }).join('');
    },

    formatDateHeader(dateStr) {
        const date = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const taskDate = new Date(date);
        taskDate.setHours(0, 0, 0, 0);

        const diff = Math.floor((taskDate - today) / (1000 * 60 * 60 * 24));

        if (diff === 0) return 'Today';
        if (diff === -1) return 'Yesterday';
        if (diff === 1) return 'Tomorrow';

        return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    },

    // Quick Add functionality
    initQuickAdd() {
        // Tab switching
        const tabs = document.querySelectorAll('.liquid-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;

                // Update tab active states
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update content active states
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });

                if (tabName === 'allTasks') {
                    document.getElementById('allTasksTab').classList.add('active');
                } else if (tabName === 'quickAdd') {
                    document.getElementById('quickAddTab').classList.add('active');
                    this.renderQuickAddOptions();
                }
            });
        });

        // Quick Add task selection
        document.getElementById('quickAddTaskSelect').addEventListener('change', (e) => {
            const taskId = e.target.value;
            if (taskId) {
                document.getElementById('quickAddForm').style.display = 'block';
                document.getElementById('quickAddEmpty').style.display = 'none';
                this.updateQuickAddPreview();
            } else {
                document.getElementById('quickAddForm').style.display = 'none';
            }
        });

        // Date range changes
        document.getElementById('quickAddFromDate').addEventListener('change', () => this.updateQuickAddPreview());
        document.getElementById('quickAddToDate').addEventListener('change', () => this.updateQuickAddPreview());

        // Execute quick add
        document.getElementById('executeQuickAdd').addEventListener('click', () => this.executeQuickAdd());
    },

    renderQuickAddOptions() {
        const tasks = StorageManager.getTasks();
        const members = StorageManager.getMembers();

        // Get unique recurring tasks
        const recurringTasks = tasks.filter(t => t.recurrence && t.recurrence !== 'none');
        const uniqueTasks = [];
        const seen = new Set();

        recurringTasks.forEach(task => {
            const key = `${task.name}_${task.recurrence}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueTasks.push(task);
            }
        });

        const select = document.getElementById('quickAddTaskSelect');

        if (uniqueTasks.length === 0) {
            document.getElementById('quickAddEmpty').style.display = 'block';
            document.getElementById('quickAddForm').style.display = 'none';
            select.innerHTML = '<option value="">-- No recurring tasks found --</option>';
            return;
        }

        document.getElementById('quickAddEmpty').style.display = 'none';

        select.innerHTML = '<option value="">-- Choose a recurring task --</option>' +
            uniqueTasks.map(task =>
                `<option value="${task.id}">${task.name} (${task.recurrence})</option>`
            ).join('');

        // Render member checkboxes
        const membersList = document.getElementById('quickAddMembersList');
        membersList.innerHTML = members.map(member => `
            <label class="member-checkbox-item">
                <input type="checkbox" value="${member.id}" onchange="TaskUI.updateQuickAddPreview()">
                ${member.photo ? `<img src="${member.photo}" class="member-checkbox-avatar" alt="${member.name}">` : ''}
                <span>${member.name}</span>
            </label>
        `).join('');

        // Set default dates
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        document.getElementById('quickAddFromDate').valueAsDate = today;
        document.getElementById('quickAddToDate').valueAsDate = nextWeek;
    },

    updateQuickAddPreview() {
        const taskId = document.getElementById('quickAddTaskSelect').value;
        if (!taskId) return;

        const tasks = StorageManager.getTasks();
        const selectedTask = tasks.find(t => t.id === taskId);
        if (!selectedTask) return;

        const fromDate = new Date(document.getElementById('quickAddFromDate').value);
        const toDate = new Date(document.getElementById('quickAddToDate').value);

        const selectedMembers = Array.from(document.querySelectorAll('#quickAddMembersList input:checked'))
            .map(cb => cb.value);

        if (selectedMembers.length === 0 || !fromDate || !toDate) {
            document.getElementById('quickAddPreview').innerHTML = 'Select dates and at least one family member';
            return;
        }

        // Generate dates based on recurrence
        const dates = this.generateRecurringDates(fromDate, toDate, selectedTask.recurrence, selectedTask.date);
        const totalTasks = dates.length * selectedMembers.length;

        const members = StorageManager.getMembers();
        const memberNames = selectedMembers.map(id => {
            const member = members.find(m => m.id === id);
            return member ? member.name : 'Unknown';
        }).join(', ');

        document.getElementById('quickAddPreview').innerHTML = `
            <div>
                <strong>${selectedTask.name}</strong> (${selectedTask.recurrence})
                <br>for <strong>${memberNames}</strong>
            </div>
            <div class="preview-stats">
                <div class="preview-stat">
                    <div class="preview-stat-value">${dates.length}</div>
                    <div class="preview-stat-label">Dates</div>
                </div>
                <div class="preview-stat">
                    <div class="preview-stat-value">${selectedMembers.length}</div>
                    <div class="preview-stat-label">Members</div>
                </div>
                <div class="preview-stat">
                    <div class="preview-stat-value">${totalTasks}</div>
                    <div class="preview-stat-label">Total Tasks</div>
                </div>
            </div>
        `;
    },

    generateRecurringDates(fromDate, toDate, recurrence, originalDate) {
        const dates = [];
        const current = new Date(fromDate);
        const end = new Date(toDate);
        const original = new Date(originalDate);

        while (current <= end) {
            let shouldAdd = false;

            if (recurrence === 'daily') {
                shouldAdd = true;
            } else if (recurrence === 'weekly') {
                // Same day of week as original
                shouldAdd = current.getDay() === original.getDay();
            } else if (recurrence === 'monthly') {
                // Same day of month as original
                shouldAdd = current.getDate() === original.getDate();
            }

            if (shouldAdd) {
                dates.push(current.toISOString().split('T')[0]);
            }

            current.setDate(current.getDate() + 1);
        }

        return dates;
    },

    executeQuickAdd() {
        const taskId = document.getElementById('quickAddTaskSelect').value;
        if (!taskId) {
            alert('Please select a task');
            return;
        }

        const tasks = StorageManager.getTasks();
        const selectedTask = tasks.find(t => t.id === taskId);
        if (!selectedTask) return;

        const fromDate = new Date(document.getElementById('quickAddFromDate').value);
        const toDate = new Date(document.getElementById('quickAddToDate').value);

        const selectedMembers = Array.from(document.querySelectorAll('#quickAddMembersList input:checked'))
            .map(cb => cb.value);

        if (selectedMembers.length === 0) {
            alert('Please select at least one family member');
            return;
        }

        if (!fromDate || !toDate || toDate < fromDate) {
            alert('Please select valid date range');
            return;
        }

        // Generate dates
        const dates = this.generateRecurringDates(fromDate, toDate, selectedTask.recurrence, selectedTask.date);

        // Create tasks
        let created = 0;
        dates.forEach(date => {
            selectedMembers.forEach(memberId => {
                const newTask = {
                    memberId: memberId,
                    name: selectedTask.name,
                    date: date,
                    time: selectedTask.time || '',
                    recurrence: 'none' // Individual instances are not recurring
                };
                StorageManager.saveTask(newTask);
                created++;
            });
        });

        // Update UI
        this.render();
        ChartManager.update();
        StatsUI.update();

        // Reset form
        document.getElementById('quickAddTaskSelect').value = '';
        document.getElementById('quickAddForm').style.display = 'none';
        document.querySelectorAll('#quickAddMembersList input').forEach(cb => cb.checked = false);

        // Switch back to All Tasks tab
        document.querySelector('.liquid-tab[data-tab="allTasks"]').click();

        alert(`✅ Created ${created} tasks successfully!`);
    }
};

// ===========================
// Stats UI Manager
// ===========================
const StatsUI = {
    init() {
        this.update();
    },

    update() {
        const tasks = StorageManager.getTasks();
        const members = StorageManager.getMembers();
        const today = new Date().toISOString().split('T')[0];

        // Today's total
        const todayTasks = tasks.filter(t => t.date === today);
        document.getElementById('todayTotal').textContent = todayTasks.length;

        // 7-day average
        const last7Days = this.getLast7Days();
        const last7Tasks = tasks.filter(t => last7Days.includes(t.date));
        const avg = (last7Tasks.length / 7).toFixed(1);
        document.getElementById('weekAvg').textContent = avg;

        // Top contributor today
        const todayByMember = {};
        todayTasks.forEach(t => {
            todayByMember[t.memberId] = (todayByMember[t.memberId] || 0) + 1;
        });
        const topId = Object.keys(todayByMember).reduce((a, b) =>
            todayByMember[a] > todayByMember[b] ? a : b, null);
        const topMember = members.find(m => m.id === topId);
        document.getElementById('topContributor').textContent = topMember?.name || '—';

        // All-time total
        document.getElementById('totalAllTime').textContent = tasks.length;

        // Longest streak (simplified: consecutive days with at least 1 task)
        const streak = this.calculateLongestStreak(tasks);
        document.getElementById('longestStreak').textContent = `${streak} days`;

        // Breakdown by person
        this.renderBreakdown(tasks, members);
    },

    getLast7Days() {
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toISOString().split('T')[0]);
        }
        return dates;
    },

    calculateLongestStreak(tasks) {
        if (tasks.length === 0) return 0;

        const dates = [...new Set(tasks.map(t => t.date))].sort();
        let maxStreak = 1;
        let currentStreak = 1;

        for (let i = 1; i < dates.length; i++) {
            const prev = new Date(dates[i - 1]);
            const curr = new Date(dates[i]);
            const diff = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));

            if (diff === 1) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                currentStreak = 1;
            }
        }

        return maxStreak;
    },

    renderBreakdown(tasks, members) {
        const container = document.getElementById('breakdownList');

        const breakdown = members.map(member => {
            const count = tasks.filter(t => t.memberId === member.id).length;
            return { ...member, count };
        }).sort((a, b) => b.count - a.count);

        container.innerHTML = breakdown.map(item => `
            <div class="breakdown-item">
                ${item.photo ? `<img src="${item.photo}" class="breakdown-avatar" alt="${item.name}">` : ''}
                <div class="breakdown-info">
                    <div class="breakdown-name">${item.name}</div>
                    <div class="breakdown-label">Total Tasks</div>
                </div>
                <div>
                    <div class="breakdown-count">${item.count}</div>
                </div>
            </div>
        `).join('');
    }
};

// ===========================
// Member Setup UI
// ===========================
const SetupUI = {
    currentMember: null,

    init() {
        // Initialize member modal listeners (needed for both setup and settings)
        this.initMemberModal();

        // Check if setup is complete
        if (StorageManager.isSetupComplete()) {
            document.getElementById('setupScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            return;
        }

        // Setup screen controls
        document.getElementById('addMemberBtn').addEventListener('click', () => this.openMemberModal());
        document.getElementById('finishSetupBtn').addEventListener('click', () => this.finishSetup());

        this.renderSetupList();
    },

    initMemberModal() {
        document.getElementById('closeMemberModal').addEventListener('click', () => this.closeMemberModal());
        document.getElementById('cancelMemberBtn').addEventListener('click', () => this.closeMemberModal());
        document.getElementById('saveMemberBtn').addEventListener('click', () => this.saveMember());
        document.getElementById('uploadPhotoBtn').addEventListener('click', () => {
            document.getElementById('memberPhoto').click();
        });
        document.getElementById('memberPhoto').addEventListener('change', (e) => this.handlePhotoUpload(e));

        // Settings page member management
        document.getElementById('addMemberSettingsBtn').addEventListener('click', () => this.openMemberModal());
    },

    openMemberModal(member = null) {
        this.currentMember = member;
        const modal = document.getElementById('memberModal');
        const title = document.getElementById('memberModalTitle');
        const preview = document.getElementById('photoPreview');

        if (member) {
            title.textContent = 'Edit Family Member';
            document.getElementById('memberName').value = member.name;
            if (member.photo) {
                preview.innerHTML = `<img src="${member.photo}" alt="${member.name}">`;
                preview.classList.remove('empty');
            }
        } else {
            title.textContent = 'Add Family Member';
            document.getElementById('memberName').value = '';
            preview.innerHTML = '';
            preview.classList.add('empty');
        }

        modal.classList.add('active');
    },

    closeMemberModal() {
        document.getElementById('memberModal').classList.remove('active');
        this.currentMember = null;
    },

    handlePhotoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            let photoData = event.target.result;

            try {
                photoData = await this.compressPhoto(photoData);
            } catch (err) {
                console.warn('Photo compression failed, using original image:', err);
            }

            const preview = document.getElementById('photoPreview');
            preview.innerHTML = `<img src="${photoData}" alt="Preview">`;
            preview.classList.remove('empty');
        };
        reader.readAsDataURL(file);
    },

    compressPhoto(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const maxSize = 120;

                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round(height * (maxSize / width));
                        width = maxSize;
                    }
                } else if (height > maxSize) {
                    width = Math.round(width * (maxSize / height));
                    height = maxSize;
                }

                canvas.width = width;
                canvas.height = height;

                if (!ctx) {
                    reject(new Error('Could not create canvas context'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };

            img.onerror = () => reject(new Error('Invalid image data'));
            img.src = dataUrl;
        });
    },

    saveMember() {
        const name = document.getElementById('memberName').value.trim();
        const photoPreview = document.getElementById('photoPreview').querySelector('img');

        if (!name) {
            alert('Please enter a name');
            return;
        }

        const member = {
            id: this.currentMember?.id,
            name,
            photo: photoPreview?.src || this.currentMember?.photo || '',
            color: this.currentMember?.color
        };

        StorageManager.saveMember(member);
        this.closeMemberModal();
        this.renderSetupList();
        this.renderSettingsList();
        ChartManager.update();
    },

    deleteMember(id) {
        if (confirm('Delete this family member and all their tasks?')) {
            StorageManager.deleteMember(id);
            this.renderSetupList();
            this.renderSettingsList();
            ChartManager.update();
            TaskUI.render();
            StatsUI.update();
        }
    },

    renderSetupList() {
        const container = document.getElementById('memberSetupList');
        const members = StorageManager.getMembers();

        container.innerHTML = members.map(member => `
            <div class="member-setup-item">
                ${member.photo ? `<img src="${member.photo}" class="member-setup-avatar" alt="${member.name}">` : ''}
                <div class="member-setup-name">${member.name}</div>
            </div>
        `).join('');
    },

    renderSettingsList() {
        const container = document.getElementById('settingsMembersList');
        const members = StorageManager.getMembers();

        container.innerHTML = members.map(member => `
            <div class="settings-member-item">
                ${member.photo ? `<img src="${member.photo}" class="settings-member-avatar" alt="${member.name}">` : ''}
                <div class="settings-member-name">${member.name}</div>
                <button class="settings-member-delete" onclick="SetupUI.deleteMember('${member.id}')">Delete</button>
            </div>
        `).join('');
    },

    finishSetup() {
        const members = StorageManager.getMembers();
        if (members.length === 0) {
            alert('Please add at least one family member');
            return;
        }

        StorageManager.completeSetup();
        document.getElementById('setupScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';

        // Initialize main app
        App.init();
    }
};

// ===========================
// Settings Manager
// ===========================
const SettingsManager = {
    init() {
        document.getElementById('exportDataBtn').addEventListener('click', () => this.exportData());
        document.getElementById('importDataBtn').addEventListener('click', () => {
            document.getElementById('importFileInput').click();
        });
        document.getElementById('importFileInput').addEventListener('change', (e) => this.importData(e));
        document.getElementById('saveSheetUrlBtn').addEventListener('click', () => this.saveSheetUrl());
        document.getElementById('manualSyncBtn').addEventListener('click', () => SheetBackend.sync('manual'));

        const scriptUrlInput = document.getElementById('sheetScriptUrl');
        if (scriptUrlInput) {
            scriptUrlInput.value = SheetBackend.scriptUrl || '';
        }
        SheetBackend.updateStatus(SheetBackend.isConfigured() ? 'idle' : 'unconfigured');

        SetupUI.renderSettingsList();
    },

    async saveSheetUrl() {
        const input = document.getElementById('sheetScriptUrl');
        const url = input?.value?.trim() || '';

        if (!url) {
            alert('Please paste your Google Apps Script URL');
            return;
        }

        if (!/^https:\/\//i.test(url)) {
            alert('Please enter a valid https URL');
            return;
        }

        SheetBackend.setUrl(url);
        const isValid = await SheetBackend.testConnection();

        if (!isValid) {
            alert('Could not connect. Verify deployment is set to "Anyone" and the URL is correct.');
            return;
        }

        await SheetBackend.sync('manual');
        alert('Google Sheets sync is connected and ready.');
    },

    exportData() {
        const data = StorageManager.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `familypulse-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importData(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (confirm('This will replace all current data. Continue?')) {
                    StorageManager.importData(data);
                    location.reload();
                }
            } catch (err) {
                alert('Invalid file format');
            }
        };
        reader.readAsText(file);
    }
};

// ===========================
// Navigation Manager
// ===========================
const NavigationManager = {
    init() {
        const navBtns = document.querySelectorAll('.nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const viewId = btn.dataset.view;
                this.switchView(viewId);

                // Update active state
                navBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    },

    switchView(viewId) {
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
        document.getElementById(viewId).classList.add('active');
    }
};

// ===========================
// Main App
// ===========================
const App = {
    init() {
        // Initialize all managers
        ChartManager.init();
        TaskUI.init();
        StatsUI.init();
        SettingsManager.init();
        NavigationManager.init();

        // Toggle between daily and cumulative
        document.getElementById('toggleDaily').addEventListener('click', () => {
            document.getElementById('toggleDaily').classList.add('active');
            document.getElementById('toggleCumulative').classList.remove('active');
            ChartManager.setMode('daily');
        });

        document.getElementById('toggleCumulative').addEventListener('click', () => {
            document.getElementById('toggleCumulative').classList.add('active');
            document.getElementById('toggleDaily').classList.remove('active');
            ChartManager.setMode('cumulative');
        });

        // Initial render
        ChartManager.update();
        StatsUI.update();
    }
};

// ===========================
// Initialize on Load
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    // Register Chart.js datalabels plugin globally
    if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    SheetBackend.init();

    // Initialize setup UI first
    SetupUI.init();

    // If setup is already complete, initialize the main app
    if (StorageManager.isSetupComplete()) {
        App.init();
    }
});
