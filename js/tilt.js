// 3D tilt that follows the pointer on elements with data-tilt (cards, skill rings, profile photo).
// An optional value sets the maximum angle in degrees, e.g. data-tilt="15".
// Skipped on touch screens and when the system asks for reduced motion.
const MAX_TILT = 8;

const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (finePointer && !reducedMotion) {
    document.querySelectorAll('[data-tilt]').forEach(element => {
        const maxTilt = Number(element.dataset.tilt) || MAX_TILT;

        element.addEventListener('pointermove', event => {
            const bounds = element.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / bounds.width;   // 0 (left) to 1 (right)
            const y = (event.clientY - bounds.top) / bounds.height;   // 0 (top) to 1 (bottom)
            element.style.setProperty('--tilt-x', `${(0.5 - y) * 2 * maxTilt}deg`);
            element.style.setProperty('--tilt-y', `${(x - 0.5) * 2 * maxTilt}deg`);
            element.style.setProperty('--glare-x', `${x * 100}%`);
            element.style.setProperty('--glare-y', `${y * 100}%`);
        });

        element.addEventListener('pointerleave', () => {
            for (const property of ['--tilt-x', '--tilt-y', '--glare-x', '--glare-y']) {
                element.style.removeProperty(property);
            }
        });
    });
}
