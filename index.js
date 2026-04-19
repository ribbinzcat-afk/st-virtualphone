import { extension_settings, getContext } from "../../../extensions.js";
import { eventSource, event_types } from "../../../../script.js";

const EXTENSION_NAME = "st-virtualphone"; // ชื่อโฟลเดอร์ใน GitHub (ควรตั้งให้ตรงกัน)
const EXTENSION_FOLDER = `scripts/extensions/third-party/${EXTENSION_NAME}`;

// ฟังก์ชันโหลดไฟล์ CSS
function loadCSS() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    // ใช้ EXTENSION_FOLDER เพื่อให้ path ถูกต้องเสมอ
    link.href = `/${EXTENSION_FOLDER}/style.css`;
    document.head.appendChild(link);
}

// ฟังก์ชันสร้าง UI
function createPhoneUI() {
    // ป้องกันการสร้างปุ่มซ้ำ
    if (document.getElementById('vp-floating-btn')) return;

    const floatingBtn = document.createElement('div');
    floatingBtn.id = 'vp-floating-btn';
    floatingBtn.innerHTML = '📱<div class="vp-badge" id="vp-main-badge"></div>';
    document.body.appendChild(floatingBtn);

    const phoneContainer = document.createElement('div');
    phoneContainer.id = 'vp-phone-container';

    const phoneScreen = document.createElement('div');
    phoneScreen.id = 'vp-phone-screen';
    phoneScreen.innerHTML = '<div style="padding: 20px; text-align: center; color: #333;">หน้าจอหลัก<br>(รอใส่ไอคอนแอป)</div>';

    phoneContainer.appendChild(phoneScreen);
    document.body.appendChild(phoneContainer);

    floatingBtn.addEventListener('click', () => {
        const isHidden = phoneContainer.style.display === 'none' || phoneContainer.style.display === '';
        if (isHidden) {
            phoneContainer.style.display = 'flex';
            stopVibration();
        } else {
            phoneContainer.style.display = 'none';
        }
    });
}

function triggerNotification() {
    const btn = document.getElementById('vp-floating-btn');
    const badge = document.getElementById('vp-main-badge');
    if(btn && badge) {
        btn.classList.add('vp-vibrating');
        badge.style.display = 'block';
        setTimeout(() => {
            btn.classList.remove('vp-vibrating');
        }, 1000);
    }
}

function stopVibration() {
    const btn = document.getElementById('vp-floating-btn');
    const badge = document.getElementById('vp-main-badge');
    if(btn && badge) {
        btn.classList.remove('vp-vibrating');
        badge.style.display = 'none';
    }
}

// ฟังก์ชันหลักที่จะถูกเรียกเมื่อ SillyTavern โหลด Extension นี้
async function init() {
    console.log(`📱 [${EXTENSION_NAME}] Loading extension...`);

    loadCSS();
    createPhoneUI();

    // ลองเทสต์การแจ้งเตือนหลังจากโหลดเสร็จ 3 วินาที
    setTimeout(triggerNotification, 3000);
}

// รอให้ SillyTavern พร้อม แล้วค่อยรันฟังก์ชัน init
jQuery(async () => {
    // แก้จากรัน init() ทันที เป็นรอให้ Event APP_READY ทำงานก่อน
    eventSource.on(event_types.APP_READY, async () => {
        await init();
    });
});
