// Hero background: a slowly spinning globe of dots with Dublin marked and signals arcing out from it.
// Purely decorative. If WebGL or the three.js CDN is unavailable, the hero keeps its CSS background.
import { mountScene, createGlowTexture, reducedMotion } from './three-stage.js';

// Settings
const DOT_COUNT_DESKTOP = 1400;
const DOT_COUNT_MOBILE = 700;
const MOBILE_BREAKPOINT = 768;            // px, matches the stylesheet's phone/tablet breakpoint
const GLOBE_RADIUS = 4;                   // world units
const GLOBE_FILL = 0.7;                   // globe diameter as a share of the section height
const MAX_WIDTH_FILL = 1.3;               // on narrow screens, at most this share of the section width
const DESKTOP_OFFSET = 0.2;               // shift right by this share of the width, clear of the hero text
const DOT_COLOUR = '#f5deb3';             // wheat
const DOT_OPACITY = 0.5;
const DOT_SIZE = 0.12;
const BODY_COLOUR = '#131c2f';            // site navy; hides dots on the far side
const BODY_OPACITY = 0.6;
const HOME_COLOUR = '#ffd700';            // gold
const HOME_LAT = 53.35;                   // Dublin
const HOME_LON = -6.26;
const SIGNAL_COLOUR = '#00ffff';          // aqua
const SIGNAL_COUNT = 5;
const SIGNAL_DURATION = 3;                // seconds for one signal to travel and fade
const SIGNAL_HEIGHT = 0.4;                // how high arcs rise above the surface
const ROTATION_SPEED = 0.06;              // radians per second
const AXIAL_TILT = 0.35;                  // radians; leans the north pole toward the viewer

const ARC_SEGMENTS = 64;

mountScene(document.querySelector('.home'), ({ THREE, scene, camera }) => {
    const tilt = new THREE.Group();
    tilt.rotation.x = AXIAL_TILT;
    scene.add(tilt);

    const globe = new THREE.Group();
    tilt.add(globe);

    // Dots spread evenly over the sphere (Fibonacci lattice)
    const dotCount = window.innerWidth <= MOBILE_BREAKPOINT ? DOT_COUNT_MOBILE : DOT_COUNT_DESKTOP;
    const dotPositions = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < dotCount; i++) {
        const y = 1 - (i / (dotCount - 1)) * 2;
        const ring = Math.sqrt(1 - y * y);
        const theta = goldenAngle * i;
        dotPositions.push(Math.cos(theta) * ring * GLOBE_RADIUS, y * GLOBE_RADIUS, Math.sin(theta) * ring * GLOBE_RADIUS);
    }
    const glowTexture = createGlowTexture(THREE);
    const dotsGeometry = new THREE.BufferGeometry();
    dotsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3));
    globe.add(new THREE.Points(dotsGeometry, new THREE.PointsMaterial({
        size: DOT_SIZE,
        map: glowTexture,
        color: DOT_COLOUR,
        opacity: DOT_OPACITY,
        transparent: true,
        depthWrite: false
    })));

    // Semi-transparent body drawn first so it writes depth and hides the far side
    const body = new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_RADIUS * 0.99, 48, 32),
        new THREE.MeshBasicMaterial({ color: BODY_COLOUR, opacity: BODY_OPACITY, transparent: true })
    );
    body.renderOrder = -1;
    globe.add(body);

    // Home marker with a pulsing ring
    const home = latLonToVector(HOME_LAT, HOME_LON, GLOBE_RADIUS);
    const markerGeometry = new THREE.BufferGeometry().setFromPoints([home]);
    globe.add(new THREE.Points(markerGeometry, new THREE.PointsMaterial({
        size: 0.5,
        map: glowTexture,
        color: HOME_COLOUR,
        transparent: true,
        depthWrite: false
    })));

    const pulseMaterial = new THREE.MeshBasicMaterial({
        color: HOME_COLOUR,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const pulse = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.2, 48), pulseMaterial);
    pulse.position.copy(home).multiplyScalar(1.01);
    pulse.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), home.clone().normalize());
    globe.add(pulse);

    // Start with Dublin facing the viewer
    globe.rotation.y = -Math.atan2(home.x, home.z);

    // Signals: arcs that travel from Dublin to random points, then respawn
    const signalMaterial = new THREE.LineBasicMaterial({
        color: SIGNAL_COLOUR,
        transparent: true,
        opacity: 0.8,
        depthWrite: false
    });
    const destination = new THREE.Vector3();
    const signals = [];

    for (let i = 0; i < SIGNAL_COUNT; i++) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((ARC_SEGMENTS + 1) * 3), 3));
        const line = new THREE.Line(geometry, signalMaterial);
        line.frustumCulled = false;
        globe.add(line);

        // With reduced motion, show arcs part-way so the still frame has some
        const signal = { line, progress: reducedMotion ? 0.3 + i * 0.12 : -i * (1 / SIGNAL_COUNT) };
        aim(signal);
        showProgress(signal);
        signals.push(signal);
    }

    function aim(signal) {
        do {
            destination.randomDirection();
        } while (destination.angleTo(home) < 0.6);
        destination.multiplyScalar(GLOBE_RADIUS);

        const lift = 1 + SIGNAL_HEIGHT * home.distanceTo(destination) / (2 * GLOBE_RADIUS);
        const middle = home.clone().add(destination).normalize().multiplyScalar(GLOBE_RADIUS * lift);
        const curve = new THREE.QuadraticBezierCurve3(home, middle, destination);

        const position = signal.line.geometry.attributes.position;
        curve.getPoints(ARC_SEGMENTS).forEach((point, index) => position.setXYZ(index, point.x, point.y, point.z));
        position.needsUpdate = true;
    }

    // The visible part of the arc grows from Dublin, then its tail catches up with the head
    function showProgress(signal) {
        const progress = Math.max(0, signal.progress);
        const head = Math.min(1, progress * 1.6);
        const tail = Math.max(0, progress * 1.6 - 0.6);
        const start = Math.floor(tail * ARC_SEGMENTS);
        const end = Math.ceil(head * ARC_SEGMENTS);
        signal.line.geometry.setDrawRange(start, progress > 0 ? end - start + 1 : 0);
    }

    let time = 0;

    return {
        update(delta) {
            time += delta;
            globe.rotation.y += ROTATION_SPEED * delta;

            const phase = time % 1.6 / 1.6;
            pulse.scale.setScalar(1 + phase * 2.5);
            pulseMaterial.opacity = 1 - phase;

            for (const signal of signals) {
                signal.progress += delta / SIGNAL_DURATION;
                if (signal.progress >= 1) {
                    signal.progress = -Math.random() * 0.5;
                    aim(signal);
                }
                showProgress(signal);
            }
        },
        resize() {
            const fill = Math.min(GLOBE_FILL, MAX_WIDTH_FILL * camera.aspect);
            const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
            camera.position.z = GLOBE_RADIUS / (fill * Math.tan(halfFov));

            // Text is left-aligned on desktop and centred on phones
            const visibleWidth = 2 * camera.position.z * Math.tan(halfFov) * camera.aspect;
            tilt.position.x = window.innerWidth > MOBILE_BREAKPOINT ? visibleWidth * DESKTOP_OFFSET : 0;
        }
    };

    function latLonToVector(lat, lon, radius) {
        const phi = THREE.MathUtils.degToRad(90 - lat);
        const theta = THREE.MathUtils.degToRad(lon + 180);
        return new THREE.Vector3(
            -radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
    }
}, { className: 'hero-canvas', fov: 45 });
