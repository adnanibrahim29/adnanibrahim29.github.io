// 3D tilt for cards, the profile photo and panels (elements with data-tilt).
// An optional value sets the maximum angle in degrees, e.g. data-tilt="15".
//   Mouse:  tilts toward the pointer on hover
//   Touch:  tilts toward the finger while touching or dragging across an element
//   Scroll: on touch screens, elements lean back as they enter the viewport and settle flat
//           (on desktop, only the project cards do this)
//   Motion: the optional "Enable motion" button makes elements, and the 3D scene, follow phone tilt
// Everything is off when the system asks for reduced motion.

// Settings
const MAX_TILT = 8;                       // degrees, when data-tilt has no value
const SCROLL_TILT = 12;                   // degrees elements lean back as they enter the viewport
const SCROLL_TILT_DESKTOP = '#projects [data-tilt]'; // elements that also do this with a mouse
const MOTION_RANGE = 25;                  // degrees of phone tilt for the full effect
const MOTION_SMOOTHING = 0.15;            // 0 to 1; higher follows the phone faster

const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reducedMotion) {
    const elements = [...document.querySelectorAll('[data-tilt]')];
    const visible = new Set();
    const touching = new Set();
    const motion = { enabled: false, x: 0, y: 0, baseline: null };

    function maxTilt(element) {
        return Number(element.dataset.tilt) || MAX_TILT;
    }

    // x and y run from -1 to 1 across the element (or the phone's tilt range)
    function setTilt(element, x, y) {
        const max = maxTilt(element);
        element.style.setProperty('--tilt-x', `${-y * max}deg`);
        element.style.setProperty('--tilt-y', `${x * max}deg`);
        element.style.setProperty('--glare-x', `${(x + 1) * 50}%`);
        element.style.setProperty('--glare-y', `${(y + 1) * 50}%`);
    }

    function clearTilt(element) {
        for (const property of ['--tilt-x', '--tilt-y', '--glare-x', '--glare-y']) {
            element.style.removeProperty(property);
        }
        element.classList.remove('is-tilting');
    }

    function tiltTowardPointer(element, event) {
        const bounds = element.getBoundingClientRect();
        setTilt(element,
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            ((event.clientY - bounds.top) / bounds.height) * 2 - 1);
    }

    // Mouse and touch
    for (const element of elements) {
        element.addEventListener('pointermove', event => {
            if (event.pointerType === 'mouse' ? !finePointer : !touching.has(element)) return;
            tiltTowardPointer(element, event);
        });
        element.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse') return;
            touching.add(element);
            element.classList.add('is-tilting');
            tiltTowardPointer(element, event);
        });
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
            element.addEventListener(type, () => {
                touching.delete(element);
                if (!motion.enabled) clearTilt(element);
            });
        }
    }

    // Scroll: track which elements are on screen and lean them back while they enter
    const scrollTilted = finePointer ? elements.filter(element => element.matches(SCROLL_TILT_DESKTOP)) : elements;
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.isIntersecting) visible.add(entry.target);
            else visible.delete(entry.target);
        }
        requestUpdate();
    });
    elements.forEach(element => observer.observe(element));

    let updateQueued = false;

    function requestUpdate() {
        if (updateQueued) return;
        updateQueued = true;
        requestAnimationFrame(update);
    }

    function update() {
        updateQueued = false;
        const half = window.innerHeight / 2;
        for (const element of visible) {
            if (scrollTilted.includes(element)) {
                // 1 when the element's top is at the bottom of the screen, 0 once it reaches the middle
                const entering = Math.min(Math.max((element.getBoundingClientRect().top - half) / half, 0), 1);
                element.style.setProperty('--scroll-tilt', `${entering * SCROLL_TILT}deg`);
            }
            if (motion.enabled && !touching.has(element)) {
                setTilt(element, motion.x, motion.y);
                element.classList.add('is-tilting');
            }
        }
    }

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    // Motion: phone tilt via DeviceOrientationEvent (iOS asks permission, Android doesn't)
    const motionButton = document.querySelector('.motion-toggle');

    function onOrientation(event) {
        if (event.beta === null || event.gamma === null) return;

        // Keep "left/right" and "toward/away" correct when the phone is turned sideways
        const angle = (screen.orientation && screen.orientation.angle) || 0;
        let sideways = event.gamma;
        let forward = event.beta;
        if (angle === 90) [sideways, forward] = [event.beta, -event.gamma];
        else if (angle === 270 || angle === -90) [sideways, forward] = [-event.beta, event.gamma];

        // Whatever angle the phone is held at when motion is enabled counts as flat
        motion.baseline ??= { sideways, forward };
        const clamp = value => Math.min(Math.max(value / MOTION_RANGE, -1), 1);
        motion.x += (clamp(sideways - motion.baseline.sideways) - motion.x) * MOTION_SMOOTHING;
        motion.y += (clamp(forward - motion.baseline.forward) - motion.y) * MOTION_SMOOTHING;

        window.dispatchEvent(new CustomEvent('devicetilt', { detail: { x: motion.x, y: -motion.y } }));
        requestUpdate();
    }

    async function toggleMotion() {
        if (motion.enabled) {
            window.removeEventListener('deviceorientation', onOrientation);
            Object.assign(motion, { enabled: false, x: 0, y: 0, baseline: null });
            elements.forEach(clearTilt);
            window.dispatchEvent(new CustomEvent('devicetilt', { detail: { x: 0, y: 0 } }));
        } else {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                try {
                    if (await DeviceOrientationEvent.requestPermission() !== 'granted') return;
                } catch {
                    return;
                }
            }
            window.addEventListener('deviceorientation', onOrientation);
            motion.enabled = true;
        }
        motionButton.setAttribute('aria-pressed', String(motion.enabled));
        motionButton.textContent = motion.enabled ? 'Disable motion' : 'Enable motion';
    }

    // Only offered on touch devices that have the API
    if (motionButton && !finePointer && 'DeviceOrientationEvent' in window) {
        motionButton.hidden = false;
        motionButton.addEventListener('click', toggleMotion);
    }
}
