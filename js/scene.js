// "The Cluster": one fixed full-screen three.js scene behind the whole page.
// Several clusters of glowing nodes ("sites") joined by backbone links, plus a constellation for the skills.
// Purely decorative: all content is HTML on top. If WebGL or the CDN is unavailable, the CSS gradient stays.

// Settings
const NODE_COUNT_DESKTOP = 220;
const NODE_COUNT_MOBILE = 120;
const MOBILE_BREAKPOINT = 768;            // px, matches the stylesheet's phone/tablet breakpoint
const COLOURS = {
    gold: '#ffd700',
    wheat: '#f5deb3',
    aqua: '#00ffff',
    navy: '#131c2f'                       // page background, also used for the depth fog
};
const NODE_COLOURS = [COLOURS.gold, COLOURS.wheat, COLOURS.aqua];
const NODE_SIZE = 0.6;                    // world units
const HUB_SIZE = 1.1;                     // the centre node of each cluster
const LINK_DISTANCE = 2.6;                // nodes closer than this are linked inside a cluster
const LINK_OPACITY = 0.35;                // brightness of the closest links (0 to 1)
const BACKBONE_OPACITY = 0.18;            // links between cluster hubs
const CLUSTER_RADIUS = 4;
const CLUSTER_SPIN = 0.04;                // radians per second each cluster turns about its hub
const FOG_DENSITY = 0.016;                // higher = distant nodes fade sooner
const PARALLAX_STRENGTH = 1.2;            // how far the camera drifts toward the mouse
const PARALLAX_EASING = 2;                // higher = camera follows the mouse faster
const SCROLL_EASING = 3;                  // higher = camera catches up with the scroll position faster
const NARROW_PULLBACK = 0.8;              // on portrait screens, move the camera back so the scene fits
const MAX_PIXEL_RATIO = 2;

// Section effects (each fades in as the camera nears that section's station)
const HERO_SWAY = 0.25;                   // radians the hero view swings side to side
const ORBIT_RANGE = 0.8;                  // radians the Projects view orbits either way
const ORBIT_SPEED = 0.15;                 // speed of the hero sway and Projects orbit
const ABOUT_GLOW_SIZE = 2.2;              // glow around the highlighted node at About
const PULSE_COUNT_DESKTOP = 16;           // pulses travelling along the backbone at Experience
const PULSE_COUNT_MOBILE = 8;
const PULSE_SPEED = 0.25;                 // backbone links per second
const SKILL_LIGHT_SPEED = 4;              // how fast a constellation node lights up when its skill scrolls into view
const CONTACT_BRIGHTNESS = 0.8;           // how much brighter the network gets at Contact

// Cluster centres ("sites"). The first one is the highlighted node for About.
const SITES = [
    [-12, 2, -2],
    [10, 5, -8],
    [3, -7, 5],
    [-6, -5, -16],
    [15, -4, 10]
];
// Hub-to-hub links between sites
const BACKBONE = [[0, 1], [1, 2], [2, 0], [1, 4], [2, 4], [0, 3], [3, 2]];
const SKILLS_CENTRE = [0, 15, -4];
const SKILLS_RADIUS = 7;

// Camera stations, one per section in page order: where the camera sits and what it looks at.
// Scrolling moves the camera along a smooth path through these, arriving as each section is centred.
const STATIONS = [
    { section: 'home', position: [0, 2, 30], target: [0, 0, 0] },
    { section: 'about', position: [-7, 4, 6], target: SITES[0] },
    { section: 'experience', position: [24, 6, 22], target: [9, -2, 2] },
    { section: 'education', position: [-1, -2, -5], target: SITES[3] },
    { section: 'skills', position: [0, 15, 7], target: SKILLS_CENTRE },
    { section: 'projects', position: [0, 4, 24], target: [0, 0, 0] },
    { section: 'contact', position: [0, 6, 36], target: [0, 0, 0] }
];

const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

function webglAvailable() {
    try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
        return false;
    }
}

if (webglAvailable()) {
    // A failed CDN load or renderer error just leaves the CSS gradient in place
    init().catch(() => {});
}

async function init() {
    const THREE = await import('three');

    const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    const canvas = renderer.domElement;
    canvas.id = 'scene';
    canvas.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(COLOURS.navy, FOG_DENSITY);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);

    const glowTexture = createGlowTexture(THREE);
    const world = buildWorld(THREE, scene, glowTexture);

    // Camera path through the stations
    const positionPath = new THREE.CatmullRomCurve3(STATIONS.map(s => new THREE.Vector3(...s.position)), false, 'centripetal');
    const targetPath = new THREE.CatmullRomCurve3(STATIONS.map(s => new THREE.Vector3(...s.target)), false, 'centripetal');
    const cameraTarget = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);

    // Scroll position where each station is reached: when its section is centred in the viewport
    const sections = STATIONS.map(s => document.getElementById(s.section));
    let stationScroll = [];

    function measureStations() {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        let previous = 0;
        stationScroll = sections.map((section, index) => {
            let y = section ? section.offsetTop + section.offsetHeight / 2 - window.innerHeight / 2 : previous;
            if (index === 0) y = 0;
            if (index === sections.length - 1) y = maxScroll;
            previous = Math.min(Math.max(y, previous), maxScroll);
            return previous;
        });
    }

    // Station index as a float: 2.5 means halfway between the 3rd and 4th stations
    function scrollProgress() {
        const y = window.scrollY;
        for (let i = 0; i < stationScroll.length - 1; i++) {
            const start = stationScroll[i];
            const end = stationScroll[i + 1];
            if (y <= end || i === stationScroll.length - 2) {
                const t = end > start ? Math.min(Math.max((y - start) / (end - start), 0), 1) : 1;
                return i + t * t * (3 - 2 * t); // smoothstep: linger at each station
            }
        }
        return 0;
    }

    let progress = 0;
    let elapsed = 0;

    // How close the camera is to a section's station: 1 at the station, fading to 0 at its neighbours
    const stationIndex = Object.fromEntries(STATIONS.map((station, index) => [station.section, index]));

    function weight(section) {
        return Math.max(0, 1 - Math.abs(progress - stationIndex[section]));
    }

    // Skills: each constellation node lights up in its ring's colour while that ring is on screen
    const skillCards = [...document.querySelectorAll('.Skills .card')];
    const skillLit = new Float32Array(skillCards.length);
    const skillLevel = new Float32Array(skillCards.length);
    const skillColours = skillCards.map(card =>
        new THREE.Color(getComputedStyle(card.querySelector('.percent')).getPropertyValue('--clr').trim() || COLOURS.wheat));
    const skillDim = new THREE.Color(COLOURS.wheat).multiplyScalar(0.3);
    const skillColour = new THREE.Color();
    const skillObserver = new IntersectionObserver(entries => {
        for (const entry of entries) skillLit[skillCards.indexOf(entry.target)] = entry.isIntersecting ? 1 : 0;
    }, { threshold: 0.6 });
    skillCards.forEach(card => skillObserver.observe(card));

    function updateEffects(delta) {
        // About: pulsing glow on the highlighted node
        const about = weight('about');
        world.aboutGlow.material.opacity = 0.7 * about;
        world.aboutGlow.scale.setScalar(ABOUT_GLOW_SIZE * (0.6 + 0.4 * about) * (1 + 0.12 * Math.sin(elapsed * 3)));

        // Experience: pulses travel hub to hub, brighter near the station
        const experience = weight('experience');
        const pulsePositions = world.pulses.geometry.attributes.position;
        world.pulseState.forEach((pulse, index) => {
            pulse.t += pulse.speed * delta;
            if (pulse.t > 1) Object.assign(pulse, randomPulse(), { t: pulse.t - 1 });
            const [from, to] = BACKBONE[pulse.link].map(site => SITES[site]);
            const t = pulse.reverse ? 1 - pulse.t : pulse.t;
            pulsePositions.setXYZ(index, ...from.map((value, axis) => value + (to[axis] - value) * t));
        });
        pulsePositions.needsUpdate = true;
        world.pulses.material.opacity = 0.25 + 0.75 * experience;
        world.backboneMaterial.opacity = BACKBONE_OPACITY + 0.25 * experience;

        // Skills: light the constellation as skills scroll into view
        const ease = 1 - Math.exp(-SKILL_LIGHT_SPEED * delta);
        const colours = world.skillNodes.geometry.attributes.color;
        for (let i = 0; i < skillCards.length; i++) {
            skillLevel[i] += (skillLit[i] - skillLevel[i]) * ease;
            skillColour.copy(skillDim).lerp(skillColours[i], skillLevel[i]);
            colours.setXYZ(i, skillColour.r, skillColour.g, skillColour.b);
        }
        colours.needsUpdate = true;
        world.skillLinks.material.opacity = 0.15 + 0.45 * weight('skills');

        // Contact: the fog lifts and the whole network brightens
        const contact = weight('contact');
        scene.fog.density = FOG_DENSITY * (1 - 0.6 * contact);
        world.nodeMaterial.size = NODE_SIZE * (1 + 0.4 * CONTACT_BRIGHTNESS * contact);
        world.hubMaterial.size = HUB_SIZE * (1 + 0.4 * CONTACT_BRIGHTNESS * contact);
        world.linkMaterial.opacity = 1 + CONTACT_BRIGHTNESS * contact;
    }

    // Mouse parallax: the camera eases toward an offset set by the pointer position
    const parallax = new THREE.Vector2();
    const parallaxTarget = new THREE.Vector2();

    function onPointerMove(event) {
        parallaxTarget.set(
            (event.clientX / window.innerWidth) * 2 - 1,
            -((event.clientY / window.innerHeight) * 2 - 1)
        );
    }

    let lastTime = null;

    function tick(time) {
        const delta = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;
        elapsed += delta;

        for (const cluster of world.clusters) cluster.rotation.y += CLUSTER_SPIN * delta;

        progress += (scrollProgress() - progress) * (1 - Math.exp(-SCROLL_EASING * delta));
        parallax.lerp(parallaxTarget, 1 - Math.exp(-PARALLAX_EASING * delta));
        updateEffects(delta);
        placeCamera();

        renderer.render(scene, camera);
    }

    function placeCamera() {
        const u = progress / (STATIONS.length - 1);
        positionPath.getPoint(u, camera.position);
        targetPath.getPoint(u, cameraTarget);

        // Portrait screens see less sideways, so back the camera off along its line of sight
        if (camera.aspect < 1) {
            offset.subVectors(camera.position, cameraTarget).multiplyScalar(1 + (1 - camera.aspect) * NARROW_PULLBACK);
            camera.position.addVectors(cameraTarget, offset);
        }

        // The hero sways gently and Projects orbits slowly around what the camera looks at
        const swing = Math.sin(elapsed * ORBIT_SPEED) * (HERO_SWAY * weight('home') + ORBIT_RANGE * weight('projects'));
        offset.subVectors(camera.position, cameraTarget).applyAxisAngle(worldUp, swing);
        camera.position.addVectors(cameraTarget, offset);

        // Parallax: nudge the camera sideways and up in its own frame
        offset.subVectors(cameraTarget, camera.position).normalize();
        right.crossVectors(offset, worldUp).normalize();
        up.crossVectors(right, offset);
        camera.position.addScaledVector(right, parallax.x * PARALLAX_STRENGTH);
        camera.position.addScaledVector(up, parallax.y * PARALLAX_STRENGTH);
        camera.lookAt(cameraTarget);
    }

    function updateLoop() {
        lastTime = null;
        renderer.setAnimationLoop(document.hidden ? null : tick);
    }

    function resize() {
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        measureStations();
    }

    function onContextLost(event) {
        event.preventDefault();
        renderer.setAnimationLoop(null);
        canvas.remove();
    }

    document.body.prepend(canvas);
    resize();
    // Start at the current scroll position (e.g. after a reload part-way down) instead of flying in
    progress = scrollProgress();

    window.addEventListener('resize', resize);
    // Section heights change as images, fonts and the typed text settle
    new ResizeObserver(measureStations).observe(document.body);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', updateLoop);
    canvas.addEventListener('webglcontextlost', onContextLost);

    updateLoop();
    requestAnimationFrame(() => canvas.classList.add('is-ready'));
}

// Builds the clusters, backbone and skills constellation. Returns the parts later steps animate.
function buildWorld(THREE, scene, glowTexture) {
    const nodeCount = isMobile ? NODE_COUNT_MOBILE : NODE_COUNT_DESKTOP;
    const perCluster = Math.floor(nodeCount / SITES.length);
    const colour = new THREE.Color();
    const linkColour = new THREE.Color(COLOURS.wheat);

    const nodeMaterial = new THREE.PointsMaterial({
        size: NODE_SIZE,
        map: glowTexture,
        vertexColors: true,
        transparent: true,
        depthWrite: false
    });
    // Link colours carry an alpha channel so longer links fade out
    const linkMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false
    });
    const hubMaterial = new THREE.PointsMaterial({
        size: HUB_SIZE,
        map: glowTexture,
        color: COLOURS.gold,
        transparent: true,
        depthWrite: false
    });

    const clusters = SITES.map((centre, siteIndex) => {
        const group = new THREE.Group();
        group.position.set(...centre);
        scene.add(group);

        // Node 0 is the hub at the cluster's centre
        const positions = [0, 0, 0];
        const colours = [...colour.set(COLOURS.gold).toArray()];
        const node = new THREE.Vector3();
        for (let i = 1; i < perCluster; i++) {
            node.randomDirection().multiplyScalar(CLUSTER_RADIUS * Math.cbrt(Math.random()));
            positions.push(node.x, node.y, node.z);
            colours.push(...colour.set(NODE_COLOURS[(i + siteIndex) % NODE_COLOURS.length]).toArray());
        }

        const linkPositions = [];
        const linkColours = [];
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        for (let i = 0; i < perCluster; i++) {
            a.fromArray(positions, i * 3);
            for (let j = i + 1; j < perCluster; j++) {
                b.fromArray(positions, j * 3);
                const distance = a.distanceTo(b);
                if (distance < LINK_DISTANCE) {
                    const fade = (1 - distance / LINK_DISTANCE) * LINK_OPACITY;
                    linkPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
                    linkColours.push(linkColour.r, linkColour.g, linkColour.b, fade);
                    linkColours.push(linkColour.r, linkColour.g, linkColour.b, fade);
                }
            }
        }

        group.add(new THREE.Points(geometry(THREE, { position: [positions, 3], color: [colours, 3] }), nodeMaterial));
        group.add(new THREE.LineSegments(geometry(THREE, { position: [linkPositions, 3], color: [linkColours, 4] }), linkMaterial));
        group.add(new THREE.Points(geometry(THREE, { position: [[0, 0, 0], 3] }), hubMaterial));
        return group;
    });

    // Backbone: faint long links between cluster hubs
    const backbonePositions = BACKBONE.flatMap(([from, to]) => [...SITES[from], ...SITES[to]]);
    const backboneMaterial = new THREE.LineBasicMaterial({
        color: COLOURS.aqua,
        transparent: true,
        opacity: BACKBONE_OPACITY,
        depthWrite: false
    });
    scene.add(new THREE.LineSegments(geometry(THREE, { position: [backbonePositions, 3] }), backboneMaterial));

    // Skills constellation: one node per skill ring on the page, joined in a loop
    const skillCount = document.querySelectorAll('.Skills .card').length || 11;
    const skillPositions = [];
    for (let i = 0; i < skillCount; i++) {
        const angle = (i / skillCount) * Math.PI * 2;
        const radius = SKILLS_RADIUS * (i % 2 ? 0.65 : 1);
        skillPositions.push(
            SKILLS_CENTRE[0] + Math.cos(angle) * radius,
            SKILLS_CENTRE[1] + Math.sin(angle) * radius,
            SKILLS_CENTRE[2] + Math.sin(angle * 3) * 0.8
        );
    }
    const skillLinkPositions = [];
    for (let i = 0; i < skillCount; i++) {
        const j = (i + 1) % skillCount;
        skillLinkPositions.push(...skillPositions.slice(i * 3, i * 3 + 3), ...skillPositions.slice(j * 3, j * 3 + 3));
    }
    const skillColours = new Float32Array(skillCount * 3).fill(0.5);
    const skillNodes = new THREE.Points(
        geometry(THREE, { position: [skillPositions, 3], color: [skillColours, 3] }),
        new THREE.PointsMaterial({ size: 1.6, map: glowTexture, vertexColors: true, transparent: true, depthWrite: false })
    );
    const skillLinks = new THREE.LineSegments(
        geometry(THREE, { position: [skillLinkPositions, 3] }),
        new THREE.LineBasicMaterial({ color: COLOURS.wheat, transparent: true, opacity: 0.25, depthWrite: false })
    );
    scene.add(skillNodes, skillLinks);

    // About: a glow that appears around the first site's hub
    const aboutGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: COLOURS.gold,
        transparent: true,
        depthWrite: false,
        opacity: 0
    }));
    aboutGlow.position.set(...SITES[0]);
    scene.add(aboutGlow);

    // Experience: pulses that travel along the backbone (positions are set every frame)
    const pulseState = Array.from({ length: isMobile ? PULSE_COUNT_MOBILE : PULSE_COUNT_DESKTOP }, () =>
        Object.assign(randomPulse(), { t: Math.random() }));
    const pulses = new THREE.Points(
        geometry(THREE, { position: [new Float32Array(pulseState.length * 3), 3] }),
        new THREE.PointsMaterial({ size: 1.3, map: glowTexture, color: COLOURS.aqua, transparent: true, depthWrite: false })
    );
    pulses.frustumCulled = false;
    scene.add(pulses);

    return {
        clusters, nodeMaterial, linkMaterial, hubMaterial, backboneMaterial,
        skillNodes, skillLinks, aboutGlow, pulses, pulseState
    };
}

function randomPulse() {
    return {
        link: Math.floor(Math.random() * BACKBONE.length),
        reverse: Math.random() < 0.5,
        speed: PULSE_SPEED * (0.7 + Math.random() * 0.6)
    };
}

function geometry(THREE, attributes) {
    const result = new THREE.BufferGeometry();
    for (const [name, [values, size]] of Object.entries(attributes)) {
        result.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
    }
    return result;
}

// Soft round sprite so each node looks like a small glowing dot
function createGlowTexture(THREE) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
