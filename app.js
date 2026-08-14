export default class App {
    constructor(database, firebase) {
        this.database = database;
        this.firebase = firebase;
        this.pcGrid = document.getElementById('pc-grid');
        this.controlModal = document.getElementById('control-modal');
        this.settingsModal = document.getElementById('settings-modal');
        this.modalPcId = document.getElementById('modal-pc-id');
        this.connectionStatus = document.getElementById('connection-status');
        
        this.currentPcId = null;
        this.countdownIntervals = {};
        this.totalPcs = 10;
    }

    init() {
        this.listenToFirebaseConnection();
        this.listenToDevices();
        this.renderInitialGrid();
    }

    listenToFirebaseConnection() {
        const connectedRef = this.firebase.ref(this.database, ".info/connected");
        this.firebase.onValue(connectedRef, (snap) => {
          if (snap.val() === true) {
            this.connectionStatus.textContent = 'CONNECTED';
            this.connectionStatus.className = 'bg-green-600 text-white px-3 py-1 rounded-full text-xs font-bold';
          } else {
            this.connectionStatus.textContent = 'DISCONNECTED';
            this.connectionStatus.className = 'bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold';
          }
        });
    }

    renderInitialGrid() {
        this.pcGrid.innerHTML = '';
        for (let i = 1; i <= this.totalPcs; i++) {
            const pcId = `PC-${String(i).padStart(2, '0')}`;
            const card = this.createPCCard(pcId, { status: 'OFFLINE' });
            this.pcGrid.appendChild(card);
        }
    }

    listenToDevices() {
        const devicesRef = this.firebase.ref(this.database, 'devices');
        this.firebase.onValue(devicesRef, (snapshot) => {
            const devices = snapshot.val() || {};
            this.pcGrid.querySelectorAll('.pc-card').forEach(card => {
                const pcId = card.dataset.pcId;
                const pcData = devices[pcId] || { status: 'OFFLINE' };
                this.updatePCCard(pcId, pcData);
            });
        });
    }

    createPCCard(pcId, pcData) {
        const card = document.createElement('div');
        card.className = 'pc-card rounded-lg shadow-lg p-4 flex flex-col justify-between transition-all duration-300';
        card.dataset.pcId = pcId;

        card.innerHTML = `
            <div>
                <div class="flex justify-between items-center mb-2">
                    <h3 class="text-xl font-bold">${pcId}</h3>
                    <span class="status-badge text-xs font-semibold px-2.5 py-1 rounded-full">OFFLINE</span>
                </div>
                <div class="timer-container text-center my-4">
                    <p class="timer-display text-4xl font-mono">--:--</p>
                    <p class="timer-label text-xs text-gray-300">No Active Session</p>
                </div>
            </div>
            <button onclick="app.openControlModal('${pcId}')" class="control-button w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded mt-2 transition-colors">
                <i class="fas fa-cog mr-2"></i>Control
            </button>
        `;
        this.updatePCCardView(card, pcData);
        return card;
    }

    updatePCCard(pcId, pcData) {
        let card = this.pcGrid.querySelector(`[data-pc-id="${pcId}"]`);
        if (!card) {
            card = this.createPCCard(pcId, pcData);
            this.pcGrid.appendChild(card);
        } else {
            this.updatePCCardView(card, pcData);
        }
    }

    updatePCCardView(card, pcData) {
        const status = pcData.isUnlimited ? 'OPEN TIME' : (pcData.status || 'OFFLINE');
        const statusBadge = card.querySelector('.status-badge');
        const timerDisplay = card.querySelector('.timer-display');
        const timerLabel = card.querySelector('.timer-label');
        const controlButton = card.querySelector('.control-button');

        statusBadge.textContent = status.replace(/_/g, ' ');
        card.className = `pc-card rounded-lg shadow-lg p-4 flex flex-col justify-between transition-all duration-300 status-${status.toLowerCase().replace(/ /g, '-')}`;
        controlButton.disabled = status === 'OFFLINE';

        if (this.countdownIntervals[card.dataset.pcId]) {
            clearInterval(this.countdownIntervals[card.dataset.pcId]);
        }

        if (status === 'BUSY') {
            const endTime = pcData.endTime || 0;
            timerLabel.textContent = 'Remaining Time';
            this.countdownIntervals[card.dataset.pcId] = setInterval(() => {
                const remaining = endTime - Date.now();
                if (remaining > 0) {
                    timerDisplay.textContent = this.formatTime(remaining);
                } else {
                    timerDisplay.textContent = '00:00';
                    timerLabel.textContent = 'Time Expired';
                    clearInterval(this.countdownIntervals[card.dataset.pcId]);
                }
            }, 1000);
        } else if (status === 'OPEN TIME') {
            const startTime = pcData.startTime || 0;
            timerLabel.textContent = 'Elapsed Time';
            this.countdownIntervals[card.dataset.pcId] = setInterval(() => {
                const elapsed = Date.now() - startTime;
                timerDisplay.textContent = this.formatTime(elapsed);
            }, 1000);
        } else {
            timerDisplay.textContent = '--:--';
            timerLabel.textContent = 'No Active Session';
        }
    }

    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) {
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // --- Modal and Command Logic ---

    openControlModal(pcId) {
        this.currentPcId = pcId;
        this.modalPcId.textContent = `Control ${pcId}`;
        this.controlModal.classList.remove('hidden');
    }

    closeControlModal() {
        this.controlModal.classList.add('hidden');
        this.currentPcId = null;
    }

    openSettingsModal() {
        this.settingsModal.classList.remove('hidden');
        this.firebase.get(this.firebase.ref(this.database, 'settings/dailyPin')).then(snapshot => {
            if (snapshot.exists()) {
                document.getElementById('daily-pin-input').value = snapshot.val();
            }
        });
    }

    closeSettingsModal() {
        this.settingsModal.classList.add('hidden');
    }

    async addFixedTime() {
        const minutesToAdd = parseInt(document.getElementById('modal-add-time-input').value);
        if (!this.currentPcId || isNaN(minutesToAdd) || minutesToAdd <= 0) return;

        const pcRef = this.firebase.ref(this.database, `devices/${this.currentPcId}`);
        const snapshot = await this.firebase.get(pcRef);
        const pcData = snapshot.val() || {};
        const currentTime = Date.now();

        const baseTime = (pcData.status === 'BUSY' && pcData.endTime > currentTime) ? pcData.endTime : currentTime;
        const newEndTime = baseTime + minutesToAdd * 60 * 1000;

        this.firebase.update(pcRef, {
            status: 'BUSY',
            isUnlimited: false,
            startTime: pcData.startTime || currentTime,
            endTime: newEndTime,
            command: 'UNLOCK'
        });
        this.closeControlModal();
    }

    openUnlimitedSession() {
        if (!this.currentPcId) return;
        const pcRef = this.firebase.ref(this.database, `devices/${this.currentPcId}`);
        this.firebase.update(pcRef, {
            status: 'BUSY',
            isUnlimited: true,
            startTime: Date.now(),
            endTime: null,
            command: 'UNLOCK'
        });
        this.closeControlModal();
    }

    forceLock() {
        if (!this.currentPcId) return;
        const pcRef = this.firebase.ref(this.database, `devices/${this.currentPcId}`);
        this.firebase.update(pcRef, {
            status: 'LOCKED',
            isUnlimited: false,
            startTime: null,
            endTime: null,
            command: 'FORCE_LOCK'
        });
        this.closeControlModal();
    }

    sendBroadcast() {
        if (!this.currentPcId) return;
        const message = document.getElementById('modal-broadcast-input').value;
        if (!message) return;
        const pcRef = this.firebase.ref(this.database, `devices/${this.currentPcId}`);
        this.firebase.update(pcRef, { broadcast: message });
        document.getElementById('modal-broadcast-input').value = '';
        alert(`Message sent to ${this.currentPcId}`);
    }

    async sendGlobalCommand(command) {
        if (!confirm(`Are you sure you want to execute '${command}' on all applicable PCs?`)) return;

        const devicesRef = this.firebase.ref(this.database, 'devices');
        const snapshot = await this.firebase.get(devicesRef);
        if (!snapshot.exists()) return;

        const allPcs = snapshot.val();
        const updates = {};
        let commandSent = false;

        Object.keys(allPcs).forEach(pcId => {
            const pc = allPcs[pcId];
            if (pc.status !== 'OFFLINE') {
                if (command === 'LOCK_AVAILABLE' && pc.status === 'AVAILABLE') {
                    updates[`/devices/${pcId}/command`] = 'LOCK';
                    commandSent = true;
                } else if (command === 'UNLOCK_ALL' || command === 'SHUTDOWN_ALL') {
                    updates[`/devices/${pcId}/command`] = command;
                    commandSent = true;
                }
            }
        });

        if (commandSent) {
            this.firebase.update(this.firebase.ref(this.database), updates)
                .then(() => alert(`'${command}' command sent successfully!`))
                .catch(error => console.error("Error sending global command:", error));
        } else {
            alert("No applicable PCs found for this command.");
        }
    }

    saveDailyPin() {
        const newPin = document.getElementById('daily-pin-input').value;
        if (!newPin) return;
        this.firebase.update(this.firebase.ref(this.database, 'settings'), { dailyPin: newPin })
            .then(() => { alert('Daily PIN updated!'); this.closeSettingsModal(); })
            .catch(error => console.error("Error saving PIN:", error));
    }

    async changeAllWindowsPasswords() {
        const newPassword = document.getElementById('windows-password-input').value;
        if (!newPassword || !confirm('DANGER: Are you sure you want to change the Windows password on ALL online PCs?')) return;

        const devicesRef = this.firebase.ref(this.database, 'devices');
        const snapshot = await this.firebase.get(devicesRef);
        if (!snapshot.exists()) return;

        const allPcs = snapshot.val();
        const updates = {};
        Object.keys(allPcs).forEach(pcId => {
            if (allPcs[pcId].status !== 'OFFLINE') {
                updates[`/devices/${pcId}/command`] = 'CHANGE_SYS_PASSWORD';
                updates[`/devices/${pcId}/newPassword`] = newPassword;
            }
        });

        this.firebase.update(this.firebase.ref(this.database), updates)
            .then(() => { alert('Command to change all Windows passwords has been sent.'); this.closeSettingsModal(); })
            .catch(error => console.error("Error sending password change command:", error));
    }
}
