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
const settingsPanel = document.getElementById('settingsPanel');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const sendOnWeekendsToggle = document.getElementById('sendOnWeekendsToggle');
const weekendTimeGroup = document.getElementById('weekendTimeGroup');
const memberPhoneInput = document.getElementById('memberPhone');
const memberCountEl = document.getElementById('memberCount');

// Edit Member Modal
const editMemberModal = document.getElementById('editMemberModal');
const editMemberForm = document.getElementById('editMemberForm');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const editMemberPhoneInput = document.getElementById('editMemberPhone');

// Remove Member Modal
const removeMemberModal = document.getElementById('removeMemberModal');
const cancelRemoveBtn = document.getElementById('cancelRemoveBtn');
const confirmRemoveBtn = document.getElementById('confirmRemoveBtn');
const removeConfirmText = document.getElementById('removeConfirmText');

let memberToRemove = null;

// Initialize
loadData();

// Phone number formatting helper
function formatPhoneInput(e) {
    let value = e.target.value.replace(/\D/g, ''); // Remove all non-digits

    if (value.length > 10) {
        value = value.slice(0, 10); // Limit to 10 digits
    }

    let formatted = '';
    if (value.length > 0) {
        formatted = '(' + value.substring(0, 3);
        if (value.length >= 4) {
            formatted += ') ' + value.substring(3, 6);
            if (value.length >= 7) {
                formatted += '-' + value.substring(6, 10);
            }
        } else if (value.length === 3) {
            formatted += ')';
        }
    }

    e.target.value = formatted;
}

// Apply phone formatting to both inputs
if (memberPhoneInput) {
    memberPhoneInput.addEventListener('input', formatPhoneInput);
}
if (editMemberPhoneInput) {
    editMemberPhoneInput.addEventListener('input', formatPhoneInput);
}

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
    document.getElementById('addMemberFormView').style.display = 'block';
    document.getElementById('addMemberConfirmation').style.display = 'none';
});

addMemberForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('memberName').value;
    const phone = document.getElementById('memberPhone').value;

    // Show loading state
    const submitBtn = document.getElementById('submitAddBtn');
    const cancelBtn = document.getElementById('cancelAddBtn');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    cancelBtn.disabled = true;

    const success = await addMember(name, phone);

    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
    cancelBtn.disabled = false;

    if (success) {
        // Close modal immediately and show updated list
        addMemberModal.classList.remove('active');
        addMemberForm.reset();

        // Reset modal state for next use
        document.getElementById('addMemberFormView').style.display = 'block';
        document.getElementById('addMemberConfirmation').style.display = 'none';

        // Ensure the UI is updated (it should already be from loadData in addMember)
        renderDashboard();
    }
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

sendOnWeekendsToggle.addEventListener('change', () => {
    weekendTimeGroup.style.display = sendOnWeekendsToggle.checked ? 'block' : 'none';
});

saveSettingsBtn.addEventListener('click', async () => {
    await saveSettings();
});

// Edit Member Modal
cancelEditBtn.addEventListener('click', () => {
    editMemberModal.classList.remove('active');
    editMemberForm.reset();
});

editMemberForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editMemberId').value;
    const name = document.getElementById('editMemberName').value;
    const phone = document.getElementById('editMemberPhone').value;

    const submitBtn = document.getElementById('submitEditBtn');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    const success = await editMember(id, name, phone);

    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;

    if (success) {
        editMemberModal.classList.remove('active');
        editMemberForm.reset();
    }
});

// Remove Member Modal
cancelRemoveBtn.addEventListener('click', () => {
    removeMemberModal.classList.remove('active');
    memberToRemove = null;
});

confirmRemoveBtn.addEventListener('click', async () => {
    if (memberToRemove) {
        confirmRemoveBtn.classList.add('loading');
        confirmRemoveBtn.disabled = true;

        await removeMember(memberToRemove);

        confirmRemoveBtn.classList.remove('loading');
        confirmRemoveBtn.disabled = false;
        removeMemberModal.classList.remove('active');
        memberToRemove = null;
    }
});

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.member-actions')) {
        document.querySelectorAll('.dropdown-menu.active').forEach(menu => {
            menu.classList.remove('active');
        });
    }
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

        const nextScheduledTime = getNextScheduledTime();
        if (nextScheduledTime && appData.settings) {
            const formattedDateTime = formatDateTime(nextScheduledTime, appData.settings.timezone);
            nextUpEl.textContent = `${next.name} (${formattedDateTime})`;
        } else if (appData.settings?.paused) {
            nextUpEl.textContent = `${next.name} (Paused)`;
        } else {
            nextUpEl.textContent = next.name;
        }
    } else {
        nextUpEl.textContent = 'No members';
    }
}

function renderMembers() {
    const membersList = document.getElementById('membersList');

    // Update member count
    const count = appData.members ? appData.members.length : 0;
    memberCountEl.textContent = count;

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
                    <button class="menu-trigger" onclick="toggleMemberMenu(event, '${member.id}')">
                        <span class="material-icons">more_vert</span>
                    </button>
                    <div class="dropdown-menu" id="menu-${member.id}">
                        <button class="dropdown-item" onclick="openEditModal('${member.id}')">
                            <span class="material-icons">edit</span>
                            Edit
                        </button>
                        <button class="dropdown-item" onclick="makeNext('${member.id}')">
                            <span class="material-icons">arrow_upward</span>
                            Make Next
                        </button>
                        <button class="dropdown-item danger" onclick="openRemoveModal('${member.id}', '${member.name.replace(/'/g, "\\'")}')">
                            <span class="material-icons">delete</span>
                            Remove
                        </button>
                    </div>
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

    // Weekend settings
    const sendOnWeekends = appData.settings.sendOnWeekends || false;
    document.getElementById('sendOnWeekendsToggle').checked = sendOnWeekends;
    document.getElementById('weekendSendTime').value = appData.settings.weekendSendTime || appData.settings.sendTime;
    weekendTimeGroup.style.display = sendOnWeekends ? 'block' : 'none';
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
            return true;
        } else {
            alert('Failed to add member');
            return false;
        }
    } catch (error) {
        console.error('Failed to add member:', error);
        alert('Failed to add member');
        return false;
    }
}

async function removeMember(id) {
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

async function editMember(id, name, phone) {
    try {
        const response = await fetch('/.netlify/functions/update-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'editMember',
                id,
                name,
                phone: phone.replace(/\D/g, '') // Remove non-digits
            })
        });

        if (response.ok) {
            await loadData();
            return true;
        } else {
            alert('Failed to update member');
            return false;
        }
    } catch (error) {
        console.error('Failed to update member:', error);
        alert('Failed to update member');
        return false;
    }
}

async function makeNext(id) {
    // Close any open menus
    document.querySelectorAll('.dropdown-menu.active').forEach(menu => {
        menu.classList.remove('active');
    });

    try {
        const response = await fetch('/.netlify/functions/update-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'setNextMember',
                id
            })
        });

        if (response.ok) {
            await loadData();
        } else {
            alert('Failed to set next member');
        }
    } catch (error) {
        console.error('Failed to set next member:', error);
        alert('Failed to set next member');
    }
}

function toggleMemberMenu(event, memberId) {
    event.stopPropagation();

    // Close all other menus first
    document.querySelectorAll('.dropdown-menu.active').forEach(menu => {
        if (menu.id !== `menu-${memberId}`) {
            menu.classList.remove('active');
        }
    });

    // Toggle this menu
    const menu = document.getElementById(`menu-${memberId}`);
    menu.classList.toggle('active');
}

function openEditModal(memberId) {
    // Close the dropdown menu
    document.querySelectorAll('.dropdown-menu.active').forEach(menu => {
        menu.classList.remove('active');
    });

    // Find the member
    const member = appData.members.find(m => m.id === memberId);
    if (!member) return;

    // Populate the form
    document.getElementById('editMemberId').value = member.id;
    document.getElementById('editMemberName').value = member.name;
    document.getElementById('editMemberPhone').value = formatPhone(member.phone);

    // Show the modal
    editMemberModal.classList.add('active');
}

function openRemoveModal(memberId, memberName) {
    // Close the dropdown menu
    document.querySelectorAll('.dropdown-menu.active').forEach(menu => {
        menu.classList.remove('active');
    });

    memberToRemove = memberId;
    removeConfirmText.textContent = `Are you sure you want to remove ${memberName} from the group?`;
    removeMemberModal.classList.add('active');
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
            paused: document.getElementById('pausedToggle').checked,
            sendOnWeekends: document.getElementById('sendOnWeekendsToggle').checked,
            weekendSendTime: document.getElementById('weekendSendTime').value
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

function formatDateTime(date, timezone) {
    const options = {
        timeZone: timezone,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };
    return date.toLocaleString('en-US', options);
}

function getNextScheduledTime() {
    if (!appData || !appData.settings) return null;

    const { sendTime, weekendSendTime, timezone, sendOnWeekends, paused } = appData.settings;

    if (paused) return null;

    // Create a date in the specified timezone
    const now = new Date();
    const todayInTz = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const currentDay = todayInTz.getDay(); // 0 = Sunday, 6 = Saturday

    // Helper to create a date with specific time
    const createDateWithTime = (baseDate, timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const date = new Date(baseDate);
        date.setHours(hours, minutes, 0, 0);
        return date;
    };

    // Helper to check if it's a weekend
    const isWeekend = (day) => day === 0 || day === 6;

    // Start checking from today
    let checkDate = new Date(todayInTz);
    let daysChecked = 0;

    while (daysChecked < 14) { // Check up to 2 weeks ahead
        const dayOfWeek = checkDate.getDay();
        const isWeekendDay = isWeekend(dayOfWeek);

        // Skip if weekend and not sending on weekends
        if (isWeekendDay && !sendOnWeekends) {
            checkDate.setDate(checkDate.getDate() + 1);
            daysChecked++;
            continue;
        }

        // Get the appropriate send time
        const timeToUse = isWeekendDay ? (weekendSendTime || sendTime) : sendTime;
        const scheduledTime = createDateWithTime(checkDate, timeToUse);

        // Convert to timezone-aware date
        const scheduledTimeStr = scheduledTime.toLocaleString('en-US', { timeZone: timezone });
        const scheduledDate = new Date(scheduledTimeStr);

        // If this time is in the future, return it
        if (scheduledDate > now) {
            return scheduledDate;
        }

        // Move to next day
        checkDate.setDate(checkDate.getDate() + 1);
        daysChecked++;
    }

    return null;
}
