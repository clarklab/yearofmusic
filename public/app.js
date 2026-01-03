// Check authentication
if (!sessionStorage.getItem('yom-auth')) {
    window.location.href = '/index.html';
}

let appData = null;

// DOM Elements
const logoutBtn = document.getElementById('logoutBtn');
const addMemberBtn = document.getElementById('addMemberBtn');
const addMemberModal = document.getElementById('addMemberModal');
const cancelAddBtn = document.getElementById('cancelAddBtn');
const addMemberForm = document.getElementById('addMemberForm');
const manualSendBtn = document.getElementById('manualSendBtn');
const skipTurnBtn = document.getElementById('skipTurnBtn');
const toggleSettingsBtn = document.getElementById('toggleSettingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

// Initialize
loadData();

// Event Listeners
logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('yom-auth');
    window.location.href = '/index.html';
});

addMemberBtn.addEventListener('click', () => {
    addMemberModal.classList.add('active');
});

cancelAddBtn.addEventListener('click', () => {
    addMemberModal.classList.remove('active');
    addMemberForm.reset();
});

addMemberForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('memberName').value;
    const phone = document.getElementById('memberPhone').value;

    await addMember(name, phone);
    addMemberModal.classList.remove('active');
    addMemberForm.reset();
});

manualSendBtn.addEventListener('click', async () => {
    if (confirm('Send reminder to the next person now?')) {
        await sendManualReminder();
    }
});

skipTurnBtn.addEventListener('click', async () => {
    if (confirm('Skip the next person in the rotation?')) {
        await skipTurn();
    }
});

toggleSettingsBtn.addEventListener('click', () => {
    const isVisible = settingsPanel.style.display !== 'none';
    settingsPanel.style.display = isVisible ? 'none' : 'block';
    toggleSettingsBtn.textContent = isVisible ? 'Edit' : 'Cancel';
});

saveSettingsBtn.addEventListener('click', async () => {
    await saveSettings();
});

// Functions
async function loadData() {
    try {
        const response = await fetch('/.netlify/functions/get-data');
        appData = await response.json();
        renderDashboard();
    } catch (error) {
        console.error('Failed to load data:', error);
        alert('Failed to load data');
    }
}

function renderDashboard() {
    renderStatus();
    renderMembers();
    renderSettings();
    renderHistory();
}

function renderStatus() {
    const lastSentEl = document.getElementById('lastSent');
    const nextUpEl = document.getElementById('nextUp');

    if (appData.history && appData.history.length > 0) {
        const last = appData.history[0];
        lastSentEl.textContent = `${last.name} (${formatDate(last.date)})`;
    } else {
        lastSentEl.textContent = 'No sends yet';
    }

    if (appData.members && appData.members.length > 0) {
        const nextIndex = appData.currentIndex % appData.members.length;
        const next = appData.members[nextIndex];
        nextUpEl.textContent = next.name;
    } else {
        nextUpEl.textContent = 'No members';
    }
}

function renderMembers() {
    const membersList = document.getElementById('membersList');

    if (!appData.members || appData.members.length === 0) {
        membersList.innerHTML = '<div class="empty-state">No members yet. Add your first member!</div>';
        return;
    }

    const nextIndex = appData.currentIndex % appData.members.length;
    let lastSentName = null;
    if (appData.history && appData.history.length > 0) {
        lastSentName = appData.history[0].name;
    }

    membersList.innerHTML = appData.members.map((member, index) => {
        const isNext = index === nextIndex;
        const isLast = member.name === lastSentName;
        const classes = [];
        if (isNext) classes.push('next-up');
        if (isLast) classes.push('last-sent');

        return `
            <div class="member-item ${classes.join(' ')}">
                <div class="member-info">
                    <div class="member-name">
                        ${member.name}
                        ${isNext ? '<span class="member-badge badge-next">NEXT UP</span>' : ''}
                        ${isLast ? '<span class="member-badge badge-last">LAST SENT</span>' : ''}
                    </div>
                    <div class="member-phone">${formatPhone(member.phone)}</div>
                </div>
                <div class="member-actions">
                    <button class="btn-danger btn-small" onclick="removeMember('${member.id}')">Remove</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderSettings() {
    document.getElementById('sendTime').value = appData.settings.sendTime;
    document.getElementById('timezone').value = appData.settings.timezone;
    document.getElementById('messageTemplate').value = appData.settings.message;
    document.getElementById('pausedToggle').checked = appData.settings.paused;
}

function renderHistory() {
    const historyList = document.getElementById('historyList');

    if (!appData.history || appData.history.length === 0) {
        historyList.innerHTML = '<div class="empty-state">No history yet</div>';
        return;
    }

    historyList.innerHTML = appData.history.slice(0, 20).map(item => `
        <div class="history-item">
            <div>
                <strong>${item.name}</strong> - ${formatPhone(item.phone)}
            </div>
            <div>
                <span class="history-date">${formatDate(item.date)}</span>
                <span class="history-status status-${item.status}">${item.status}</span>
            </div>
        </div>
    `).join('');
}

async function addMember(name, phone) {
    try {
        const response = await fetch('/.netlify/functions/update-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'addMember',
                name,
                phone: phone.replace(/\D/g, '') // Remove non-digits
            })
        });

        if (response.ok) {
            await loadData();
        } else {
            alert('Failed to add member');
        }
    } catch (error) {
        console.error('Failed to add member:', error);
        alert('Failed to add member');
    }
}

async function removeMember(id) {
    if (!confirm('Remove this member?')) return;

    try {
        const response = await fetch('/.netlify/functions/update-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'removeMember',
                id
            })
        });

        if (response.ok) {
            await loadData();
        } else {
            alert('Failed to remove member');
        }
    } catch (error) {
        console.error('Failed to remove member:', error);
        alert('Failed to remove member');
    }
}

async function sendManualReminder() {
    try {
        const response = await fetch('/.netlify/functions/send-reminder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manual: true })
        });

        const result = await response.json();

        if (result.success) {
            alert(`Reminder sent to ${result.sentTo}!`);
            await loadData();
        } else {
            alert('Failed to send reminder: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Failed to send reminder:', error);
        alert('Failed to send reminder');
    }
}

async function skipTurn() {
    try {
        const response = await fetch('/.netlify/functions/update-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'skipTurn'
            })
        });

        if (response.ok) {
            await loadData();
        } else {
            alert('Failed to skip turn');
        }
    } catch (error) {
        console.error('Failed to skip turn:', error);
        alert('Failed to skip turn');
    }
}

async function saveSettings() {
    try {
        const settings = {
            sendTime: document.getElementById('sendTime').value,
            timezone: document.getElementById('timezone').value,
            message: document.getElementById('messageTemplate').value,
            paused: document.getElementById('pausedToggle').checked
        };

        const response = await fetch('/.netlify/functions/update-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'updateSettings',
                settings
            })
        });

        if (response.ok) {
            alert('Settings saved!');
            await loadData();
            settingsPanel.style.display = 'none';
            toggleSettingsBtn.textContent = 'Edit';
        } else {
            alert('Failed to save settings');
        }
    } catch (error) {
        console.error('Failed to save settings:', error);
        alert('Failed to save settings');
    }
}

function formatPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
        return `(${match[1]}) ${match[2]}-${match[3]}`;
    }
    return phone;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
