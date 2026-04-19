import { getContext } from "../../../extensions.js";
// นำเข้า eventSource จากระบบหลักของ SillyTavern เพื่อดักจับข้อความ
import { eventSource, event_types } from "../../../../script.js";

let isPhoneOpen = false;
let isFabVisible = true;

// เก็บข้อมูลแอป
const apps = [
    { id: 'line', name: 'Line', icon: '💬', color: '#06C755' },
    { id: 'phone', name: 'Phone', icon: '📞', color: '#34C759' },
    { id: 'music', name: 'Music', icon: '🎵', color: '#FF2D55' },
    { id: 'settings', name: 'Settings', icon: '⚙️', color: '#8E8E93' }
];

function createPhoneUI() {
    // 1. สร้าง Floating Button
    const fab = document.createElement('div');
    fab.id = 'st-phone-fab';
    fab.innerHTML = `📱<div id="st-phone-badge"></div>`;
    document.body.appendChild(fab);

    // 2. สร้างกรอบโทรศัพท์
    const phoneContainer = document.createElement('div');
    phoneContainer.id = 'st-phone-container';

    // สร้างหน้าจอหลัก (Screen)
    const screen = document.createElement('div');
    screen.id = 'st-phone-screen';

    // สร้าง Home Screen
    const homeScreen = document.createElement('div');
    homeScreen.id = 'st-phone-home';

    // สร้างไอคอนแอปใส่ใน Home Screen
    apps.forEach(app => {
        const appIcon = document.createElement('div');
        appIcon.className = 'st-app-icon';
        appIcon.innerHTML = `
            <div class="st-app-icon-img" style="color: ${app.color};">${app.icon}</div>
            <div class="st-app-badge" id="badge-${app.id}">1</div>
            <div class="st-app-icon-name">${app.name}</div>
        `;
        appIcon.addEventListener('click', () => openApp(app.id, app.name));
        homeScreen.appendChild(appIcon);
    });

    screen.appendChild(homeScreen);

    // สร้างหน้าต่างสำหรับแต่ละแอป (ซ่อนไว้ก่อน)
    apps.forEach(app => {
        const appWindow = document.createElement('div');
        appWindow.id = `window-${app.id}`;
        appWindow.className = 'st-app-window';
        appWindow.innerHTML = `
            <div class="st-app-header">
                <div class="st-back-btn" onclick="document.getElementById('window-${app.id}').style.display='none'">❮ Back</div>
                <div>${app.name}</div>
            </div>
            <div class="st-app-content" id="content-${app.id}">
                <p>Welcome to ${app.name} App!</p>
                <!-- เนื้อหาแอปจะมาใส่ตรงนี้ใน Phase ต่อไป -->
            </div>
        `;
        screen.appendChild(appWindow);
    });

    phoneContainer.appendChild(screen);
    document.body.appendChild(phoneContainer);

    fab.addEventListener('click', togglePhone);
}

// ฟังก์ชันเปิดแอป
function openApp(appId, appName) {
    // ซ่อนจุดแจ้งเตือนของแอปนั้น
    document.getElementById(`badge-${appId}`).style.display = 'none';
    // โชว์หน้าต่างแอป
    document.getElementById(`window-${appId}`).style.display = 'flex';
}

function togglePhone() {
    const phone = document.getElementById('st-phone-container');
    const badge = document.getElementById('st-phone-badge');
    const fab = document.getElementById('st-phone-fab');

    isPhoneOpen = !isPhoneOpen;

    if (isPhoneOpen) {
        phone.style.display = 'flex';
        badge.style.display = 'none';
        fab.classList.remove('fab-vibrating');
    } else {
        phone.style.display = 'none';
        // ปิดทุกแอปเมื่อปิดโทรศัพท์ ให้กลับไปหน้า Home
        apps.forEach(app => {
            document.getElementById(`window-${app.id}`).style.display = 'none';
        });
    }
}

function triggerNotification(appId) {
    const fab = document.getElementById('st-phone-fab');
    const mainBadge = document.getElementById('st-phone-badge');
    const appBadge = document.getElementById(`badge-${appId}`);

    if (!isPhoneOpen) {
        fab.classList.add('fab-vibrating');
        mainBadge.style.display = 'block';
        setTimeout(() => fab.classList.remove('fab-vibrating'), 2000);
    }

    // โชว์จุดแดงที่แอปด้วย
    if (appBadge) {
        appBadge.style.display = 'flex';
        // เพิ่มตัวเลขแจ้งเตือน (แบบง่ายๆ)
        appBadge.innerText = "!";
    }
}

// --- ระบบ Regex Hook ดักจับข้อความจาก AI ---
function setupMessageHook() {
    // ดักจับเมื่อมีข้อความใหม่ถูกส่งเข้ามาหรือถูกแก้ไข
    eventSource.on(event_types.MESSAGE_RECEIVED, handleNewMessage);
    eventSource.on(event_types.MESSAGE_UPDATED, handleNewMessage);
}

function handleNewMessage(messageId) {
    // ดึง Context ของแชทปัจจุบัน
    const context = getContext();
    const chat = context.chat;

    // หาข้อความล่าสุดจาก messageId
    const msgElement = document.querySelector(`.mes[mesid="${messageId}"] .mes_text`);
    if (!msgElement) return;

    let text = msgElement.innerHTML;
    let hasNotification = false;

    // 1. ดักจับแอป Line (รูปแบบ: [Line|ชื่อคนส่ง|ข้อความ])
    const lineRegex = /\[Line\|(.*?)\|(.*?)\]/gi;
    text = text.replace(lineRegex, (match, sender, message) => {
        console.log(`📱 ได้รับข้อความ Line จาก ${sender}: ${message}`);

        // TODO: ใน Phase หน้า เราจะเอาข้อมูลนี้ไปยัดใส่ UI ของแอป Line

        hasNotification = true;
        triggerNotification('line');

        // Return ค่าว่าง เพื่อ "ซ่อน" ข้อความนี้จากหน้าแชทหลัก
        return `<span style="display:none;">${match}</span>`;
    });

    // 2. ดักจับแอป Phone (รูปแบบ: [Call|ชื่อคนโทร])
    const callRegex = /\[Call\|(.*?)\]/gi;
    text = text.replace(callRegex, (match, caller) => {
        console.log(`📞 มีสายเข้าจาก: ${caller}`);
        hasNotification = true;
        triggerNotification('phone');
        return `<span style="display:none;">${match}</span>`;
    });

    // ถ้ามีการแก้ไขข้อความ ให้เขียนทับกลับไปที่หน้าจอแชท
    if (hasNotification) {
        msgElement.innerHTML = text;
    }
}

jQuery(async () => {
    console.log("📱 ST Virtual Phone Phase 2 Loaded!");
    createPhoneUI();
    setupMessageHook();
});
