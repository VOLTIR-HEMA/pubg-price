export default class App {
    constructor(database, firebase) {
        this.database = database;
        this.firebase = firebase;
        this.pcGrid = document.getElementById('pc-grid');
        // Modals
        this.controlModal = document.getElementById('control-modal');
        this.settingsModal = document.getElementById('settings-modal');
        this.wolModal = document.getElementById('wol-modal');
        this.pinConfirmationModal = document.getElementById('pin-confirmation-modal');

        this.modalPcId = document.getElementById('modal-pc-id');
        this.connectionStatus = document.getElementById('connection-status');
        this.macroRunner = new MacroRunner(this);
        
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
            if (snapshot.exists()) {
                const devices = snapshot.val();
                for (let i = 1; i <= this.totalPcs; i++) {
                    const pcId = `PC-${String(i).padStart(2, '0')}`;
                    const pcData = devices[pcId] || { status: 'OFFLINE' };
                    const card = this.pcGrid.querySelector(`[data-pc-id="${pcId}"]`);
                    if (card) {
                        this.updatePCCardView(card, pcData);
                    }
                }
            } else {
                // Handle case where 'devices' node is empty or doesn't exist
                this.renderInitialGrid();
            }
        });
    }

    createPCCard(pcId, pcData) {
        const card = document.createElement('div');
        card.className = 'pc-card rounded-lg shadow-lg p-3 md:p-4 flex flex-col justify-between transition-all duration-300';
        card.dataset.pcId = pcId;

        card.innerHTML = `
            <div class="flex-grow flex flex-col">
                <div class="flex justify-between items-center mb-2">
                    <h3 class="text-xl font-black">${pcId}</h3>
                    <span class="status-badge text-xs font-semibold px-2.5 py-1 rounded-full">OFFLINE</span>
                </div>
                <div class="timer-container text-center my-4">
                    <p class="timer-display text-4xl font-mono font-bold">--:--</p>
                    <p class="timer-label text-xs text-gray-400">No Active Session</p>
                </div>
            </div>
            <button onclick="app.openControlModal('${pcId}')" class="control-button w-full font-bold py-2 px-4 rounded mt-2 transition-all duration-300">
                <i class="fas fa-cog mr-2"></i>Control
            </button>
        `;
        this.updatePCCardView(card, pcData);
        return card;
    }

    updatePCCardView(card, pcData) {
        const pcId = card.dataset.pcId;
        const fifteenSecondsAgo = Date.now() - 15000;
        let status = pcData.isUnlimited ? 'OPEN TIME' : (pcData.status || 'OFFLINE');
        if (status !== 'OFFLINE' && (!pcData.lastUpdated || pcData.lastUpdated < fifteenSecondsAgo)) {
            status = 'OFFLINE'; // Treat as offline if no recent heartbeat
        }
        const isOnline = status !== 'OFFLINE';

        const statusBadge = card.querySelector('.status-badge');
        const timerDisplay = card.querySelector('.timer-display');
        const timerLabel = card.querySelector('.timer-label');
        const controlButton = card.querySelector('.control-button');

        statusBadge.textContent = status.replace(/_/g, ' '); // e.g., MANUAL_OPEN -> MANUAL OPEN
        
        // Reset classes and apply new theme
        const baseCardClass = 'pc-card rounded-lg shadow-lg p-3 md:p-4 flex flex-col justify-between transition-all duration-300';
        const statusColors = {
            'OFFLINE': 'bg-gray-800 text-gray-400',
            'ONLINE': 'bg-emerald-600 text-white',
            'MANUAL_OPEN': 'bg-emerald-600 text-white',
            'BUSY': 'bg-yellow-500 text-black font-bold',
            'OPEN TIME': 'bg-cyan-600 text-white font-bold',
            'LOCKED': 'bg-red-600 text-white font-bold'
        };

        if (isOnline) {
            const activeColor = status === 'LOCKED' ? 'red' : 'yellow';
            card.className = `${baseCardClass} bg-black border border-${activeColor}-400 shadow-[0_0_15px_rgba(255,215,0,0.4)] text-${activeColor}-400`;
            // Apply specific badge color, but keep the gold/red border for the card
            statusBadge.className = `status-badge text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors[status] || statusColors['ONLINE']}`;
            controlButton.className = `control-button w-full font-bold py-2 px-4 rounded mt-2 transition-all duration-300 border border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black`;
            if (status === 'LOCKED') {
                controlButton.className = `control-button w-full font-bold py-2 px-4 rounded mt-2 transition-all duration-300 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white`;
            }

        } else { // Offline
            card.className = `${baseCardClass} bg-[#111] border border-gray-800 text-gray-500`;
            statusBadge.className = `status-badge text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors['OFFLINE']}`;
            controlButton.className = 'control-button w-full font-bold py-2 px-4 rounded mt-2 transition-all duration-300 bg-gray-800 text-gray-600 cursor-not-allowed';
        }
        controlButton.disabled = !isOnline;

        if (this.countdownIntervals[pcId]) {
            clearInterval(this.countdownIntervals[pcId]);
        }

        if (status === 'BUSY') {
            const endTime = pcData.endTime || 0;
            timerLabel.textContent = 'Remaining Time';
            this.countdownIntervals[pcId] = setInterval(() => {
                const remaining = endTime - Date.now();
                if (remaining > 0) {
                    timerDisplay.textContent = this.formatTime(remaining);
                } else {
                    timerDisplay.textContent = '00:00';
                    // The status will soon change to LOCKED or ONLINE, which will clear the timer text.
                    clearInterval(this.countdownIntervals[pcId]);
                }
            }, 1000);
        } else if (status === 'OPEN TIME') {
            const startTime = pcData.startTime || 0;
            timerLabel.textContent = 'Elapsed Time';
            this.countdownIntervals[pcId] = setInterval(() => {
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

    openPinConfirmationModal(command) {
        this.pinConfirmationModal.dataset.command = command;
        document.getElementById('pin-modal-title').textContent = `Confirm: ${command.replace(/_/g, ' ')}`;
        document.getElementById('pin-modal-prompt').textContent = `Enter the Daily PIN to execute this global command.`;
        this.pinConfirmationModal.classList.remove('hidden');
        document.getElementById('pin-modal-input').focus();
    }

    closePinConfirmationModal() {
        this.pinConfirmationModal.classList.add('hidden');
        document.getElementById('pin-modal-input').value = '';
        this.pinConfirmationModal.dataset.command = '';
    }

    openWolModal() {
        const listContainer = document.getElementById('wol-pc-list');
        listContainer.innerHTML = ''; // Clear previous list

        for (let i = 1; i <= this.totalPcs; i++) {
            const pcId = `PC-${String(i).padStart(2, '0')}`;
            const item = document.createElement('div');
            item.className = 'flex justify-between items-center bg-gray-900 p-3 rounded-lg';
            item.innerHTML = `
                <span class="font-bold text-lg text-yellow-400">${pcId}</span>
                <button onclick="app.sendWolCommand('${pcId}')" class="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded transition-colors">
                    <i class="fas fa-power-off mr-2"></i>Start
                </button>
            `;
            listContainer.appendChild(item);
        }
        this.wolModal.classList.remove('hidden');
    }

    closeWolModal() {
        this.wolModal.classList.add('hidden');
    }

    sendWolCommand(pcId) {
        const pcRef = this.firebase.ref(this.database, `devices/${pcId}`);
        this.firebase.update(pcRef, { command: 'WOL' });
        // We can add a small visual feedback if needed, but an alert for each click might be annoying.
    }

    openSettingsModal() {
        this.settingsModal.classList.remove('hidden');
        this.populateMacAddressList();
    }

    toggleMacAddressList() {
        const container = document.getElementById('mac-address-container');
        const icon = document.getElementById('mac-accordion-icon');
        container.classList.toggle('hidden');
        icon.classList.toggle('rotate-180');
    }
    async populateMacAddressList() {
        const listContainer = document.getElementById('mac-address-list');
        listContainer.innerHTML = ''; // Clear previous list

        const devicesRef = this.firebase.ref(this.database, 'devices');
        const snapshot = await this.firebase.get(devicesRef);
        const devices = snapshot.val() || {};

        for (let i = 1; i <= this.totalPcs; i++) {
            const pcId = `PC-${String(i).padStart(2, '0')}`;
            const macAddress = devices[pcId]?.macAddress || '';
            const item = document.createElement('div');
            item.className = 'flex items-center gap-3';
            item.innerHTML = `
                <label for="mac-${pcId}" class="w-1/4 text-right text-yellow-400">${pcId}:</label>
                <input type="text" id="mac-${pcId}" data-pc-id="${pcId}" class="mac-input bg-gray-700 text-white border border-gray-600 rounded px-3 py-1 w-3/4" placeholder="00:1B:44:11:3A:B7" value="${macAddress}">
            `;
            listContainer.appendChild(item);
        }
    }

    saveMacAddresses() {
        const updates = {};
        document.querySelectorAll('.mac-input').forEach(input => {
            updates[`/devices/${input.dataset.pcId}/macAddress`] = input.value.trim();
        });
        this.firebase.update(this.firebase.ref(this.database), updates)
            .then(() => alert('MAC addresses saved successfully!'))
            .catch(error => alert(`Error saving MAC addresses: ${error.message}`));
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

    async confirmPinAndExecute() {
        const enteredPin = document.getElementById('pin-modal-input').value;
        if (!enteredPin) {
            alert('PIN cannot be empty.');
            return;
        }

        const pinSnapshot = await this.firebase.get(this.firebase.ref(this.database, 'settings/dailyPin'));
        const correctPin = pinSnapshot.exists() ? pinSnapshot.val() : null;

        if (enteredPin === correctPin) {
            const command = this.pinConfirmationModal.dataset.command;
            this.sendGlobalCommand(command, true); // Pass true to skip confirmation
            this.closePinConfirmationModal();
        } else {
            alert('Incorrect PIN.');
        }
    }

    async sendGlobalCommand(command, skipConfirmation = false) {
        if (!skipConfirmation && !confirm(`Are you sure you want to execute '${command}' on all applicable PCs?`)) return;

        const devicesRef = this.firebase.ref(this.database, 'devices');
        const snapshot = await this.firebase.get(devicesRef);
        if (!snapshot.exists()) return;

        const allPcs = snapshot.val();
        const updates = {};
        let commandSent = false;
        
        Object.keys(allPcs).forEach(pcId => {
            const pc = allPcs[pcId];
            // For UNLOCK_ALL, target LOCKED PCs. For SHUTDOWN_ALL, target any online PC.
            if (command === 'UNLOCK_ALL' && pc.status === 'LOCKED') {
                updates[`/devices/${pcId}/command`] = 'UNLOCK';
                commandSent = true;
            } else if (command === 'LOCK_AVAILABLE' && ['ONLINE', 'MANUAL_OPEN'].includes(pc.status)) {
                updates[`/devices/${pcId}/command`] = 'LOCK';
                commandSent = true;
            } else if (command === 'SHUTDOWN_ALL' && pc.status !== 'OFFLINE') {
                updates[`/devices/${pcId}/command`] = 'SHUTDOWN_ALL';
                commandSent = true;
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
        if (!newPin) { alert('PIN cannot be empty.'); return; }
        this.firebase.update(this.firebase.ref(this.database, 'settings'), { dailyPin: newPin })
            .then(() => alert('Daily PIN updated successfully!'))
            .catch(error => alert(`Error saving PIN: ${error.message}`));
    }

}

class MacroRunner {
    constructor(app) {
        this.app = app;
    }

    async run(steps) {
        for (const step of steps) {
            switch (step.type) {
                case 'command':
                    console.log(`Executing macro command: ${step.value} on ${step.target}`);
                    const pcRef = this.app.firebase.ref(this.app.database, `devices/${step.target}`);
                    await this.app.firebase.update(pcRef, { command: step.value });
                    break;
                case 'delay':
                    console.log(`Macro delay: ${step.value}ms`);
                    await new Promise(resolve => setTimeout(resolve, step.value));
                    break;
                default:
                    console.error(`Unknown macro step type: ${step.type}`);
            }
        }
        console.log('Macro finished.');
    }
}
