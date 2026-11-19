// @ts-expect-error The browser resolves the pinned Three.js module through the import map.
import * as THREE from "three";
export function createScene(canvas, vehicle, t = (text) => text) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121d26);
    scene.fog = new THREE.Fog(0x121d26, 13, 26);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    scene.add(new THREE.HemisphereLight(0xe0f2ff, 0x374e5c, 2.25));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.9);
    key.position.set(-4, 8, 5);
    scene.add(key);
    const rimLight = new THREE.DirectionalLight(0x92d8ff, 1.7);
    rimLight.position.set(3, 4, -5);
    scene.add(rimLight);
    const material = (color, metalness = 0.15, roughness = 0.48) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
    const rubber = material(0x141820, 0, 0.96);
    const steel = material(0x727d8c, 0.58);
    const alloy = material(0xb9c3d0, 0.65, 0.36);
    const structure = material(0x314354, 0.48);
    const stripe = material(0xeab455, 0.20);
    const rollerSurface = material(0x70818a, 0.56, 0.47);
    const motionDisc = material(0x8a9ba6, 0.52);
    const wheelMark = new THREE.MeshStandardMaterial({ color: 0xfbd488, emissive: 0xb5711d, emissiveIntensity: 0.45, roughness: 0.55 });
    const rollerMark = stripe.clone();
    rollerMark.emissive.setHex(0x8c4e15);
    rollerMark.emissiveIntensity = 0.32;
    for (const fading of [motionDisc, wheelMark, rollerMark]) {
        fading.transparent = true;
        fading.depthWrite = false;
    }
    motionDisc.side = THREE.DoubleSide;
    motionDisc.opacity = 0;
    const pack = material(0xde934a, 0.33, 0.43);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), material(0x182632, 0, 0.88));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const grid = new THREE.GridHelper(23, 46, 0x445f74, 0x2c4152);
    grid.position.y = 0.003;
    scene.add(grid);
    function box(width, height, length, mat, x, y, z) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), mat);
        mesh.position.set(x, y, z);
        return mesh;
    }
    const rollerCenterY = vehicle.rollerRadiusM + 0.085;
    const roadY = rollerCenterY + vehicle.rollerRadiusM;
    const wheelY = roadY + vehicle.wheelRadiusM;
    const halfTrack = vehicle.trackM / 2;
    // The visual asset's wheel centers are ±93.1 in its original coordinates.
    const tireXCentre = 93.1;
    const modelScaleX = halfTrack / tireXCentre;
    const halfWheelbase = vehicle.wheelbaseM / 2;
    const bodyCenterZ = (vehicle.frontOverhangM - vehicle.rearOverhangM) / 2;
    const drumWidth = (vehicle.rollerOutsideSpanM - vehicle.rollerCenterGapM) / 2;
    const drumCenterX = (vehicle.rollerCenterGapM + drumWidth) / 2;
    const frameWidth = vehicle.rollerOutsideSpanM + 0.44;
    const platformHalfLength = vehicle.lengthM / 2 + 0.5;
    const deckTop = roadY - 0.095;
    const deckDepth = 0.05;
    const windowHalfLength = Math.sqrt(vehicle.rollerRadiusM ** 2 - (deckTop - deckDepth - rollerCenterY) ** 2) + 0.035;
    const endDeckStart = halfWheelbase + windowHalfLength;
    const endDeckLength = platformHalfLength - endDeckStart;
    scene.add(box(frameWidth, 0.08, 2 * platformHalfLength, structure, 0, 0.04, 0));
    scene.add(box(frameWidth, deckDepth, vehicle.wheelbaseM - 2 * windowHalfLength, structure, 0, deckTop - deckDepth / 2, 0));
    for (const axle of [-1, 1]) {
        const z = axle * halfWheelbase;
        scene.add(box(frameWidth, deckDepth, endDeckLength, structure, 0, deckTop - deckDepth / 2, axle * (endDeckStart + endDeckLength / 2)));
        scene.add(box(vehicle.rollerCenterGapM - 0.04, 0.13, 2 * windowHalfLength, structure, 0, deckTop - 0.065, z));
        for (const side of [-1, 1]) {
            scene.add(box(0.12, deckTop - 0.08, 0.14, structure, side * (frameWidth / 2 - 0.12), (deckTop + 0.08) / 2, axle * (platformHalfLength - 0.10)));
        }
        for (const edge of [-1, 1]) {
            scene.add(box(frameWidth, 0.008, 0.022, stripe, 0, deckTop + 0.004, z + edge * (windowHalfLength + 0.025)));
        }
    }
    const vehicleMeshes = new THREE.Group();
    const vehicleLights = new THREE.Group();
    const tailStrip = new THREE.MeshBasicMaterial({ color: 0xf52f42, toneMapped: false });
    const wheels = [];
    const rollers = [];
    const drivenWheelMarks = new Map();
    const frontMotionDiscs = [];
    for (const side of [-1, 1]) {
        for (const axle of [-1, 1]) {
            const x = side * halfTrack;
            const z = axle * halfWheelbase;
            const wheel = new THREE.Group();
            wheel.position.set(x, wheelY, z);
            const disc = new THREE.Mesh(new THREE.RingGeometry(0.084, vehicle.wheelRadiusM * 0.73, 48), motionDisc);
            disc.rotation.y = Math.PI / 2;
            disc.position.x = side * 0.122;
            wheel.add(disc);
            if (axle === 1)
                frontMotionDiscs.push(disc);
            if (axle < 0) {
                const witness = box(0.004, vehicle.wheelRadiusM * 0.32, 0.028, wheelMark, side * 0.143, vehicle.wheelRadiusM * 0.81, 0);
                witness.name = "Driven wheel witness stripe";
                wheel.add(witness);
                drivenWheelMarks.set(wheel, witness);
            }
            wheels.push(wheel);
            vehicleMeshes.add(wheel);
            const drum = new THREE.Group();
            drum.position.set(side * drumCenterX, rollerCenterY, z);
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(vehicle.rollerRadiusM, vehicle.rollerRadiusM, drumWidth, 72), [rollerSurface, steel, steel]);
            barrel.rotation.z = Math.PI / 2;
            drum.add(barrel);
            for (const offset of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
                const radius = vehicle.rollerRadiusM + 0.002;
                const mark = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, drumWidth * 0.94, 5, 1, true, Math.PI * 0.60 - 0.04 + offset, 0.08), rollerMark);
                mark.name = "Drum surface stripe";
                mark.rotation.z = Math.PI / 2;
                drum.add(mark);
            }
            drum.add(box(0.007, 0.105, 0.030, rollerMark, side * (drumWidth / 2 + 0.004), vehicle.rollerRadiusM - 0.072, 0));
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.094, 0.094, 0.14, 24), alloy);
            shaft.rotation.z = Math.PI / 2;
            shaft.position.x = side * (drumWidth / 2 + 0.07);
            drum.add(shaft);
            rollers.push(drum);
            scene.add(drum);
            const bearingX = side * (vehicle.rollerOutsideSpanM / 2 + 0.11);
            scene.add(box(0.20, 0.24, 0.31, steel, bearingX, rollerCenterY, z));
            scene.add(box(0.18, rollerCenterY - 0.08, 0.38, structure, bearingX, (rollerCenterY + 0.08) / 2, z));
        }
    }
    const cell = new THREE.Group();
    const restraints = new THREE.Group();
    restraints.visible = false;
    cell.add(restraints);
    scene.add(cell);
    const floorSteel = material(0x8e9da4, 0.30, 0.72);
    const frontPlate = box(frameWidth, 0.035, 2 * windowHalfLength + 0.04, floorSteel, 0, roadY - 0.0175, halfWheelbase);
    scene.add(frontPlate);
    const floorImage = document.createElement("canvas");
    floorImage.width = floorImage.height = 64;
    const floorInk = floorImage.getContext("2d");
    floorInk.fillStyle = "#b5bcc0";
    floorInk.fillRect(0, 0, 64, 64);
    for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
            floorInk.save();
            floorInk.translate(column * 16 + 8, row * 16 + 8);
            floorInk.rotate((row + column) % 2 ? Math.PI / 4 : -Math.PI / 4);
            floorInk.fillStyle = "#919da3";
            floorInk.fillRect(-5, -1, 10, 3);
            floorInk.fillStyle = "#d5dcdf";
            floorInk.fillRect(-4, -2, 8, 2);
            floorInk.restore();
        }
    }
    const floorTexture = new THREE.CanvasTexture(floorImage);
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(18, 34);
    floorTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    floorSteel.map = floorTexture;
    const wall = material(0xadb7bb, 0.02, 0.88);
    const guard = material(0xe7be52, 0.20, 0.45);
    const restraint = material(0x6b8bb1, 0.08, 0.9);
    const fixtureLight = new THREE.MeshStandardMaterial({ color: 0xd5edf6, emissive: 0xbce6fa, emissiveIntensity: 1.4 });
    const cellWidth = 9.5;
    const cellLength = 11.4;
    const sideFloorWidth = (cellWidth - frameWidth) / 2;
    const endFloorLength = cellLength / 2 - platformHalfLength;
    const sideFloorX = (frameWidth + sideFloorWidth) / 2;
    for (const side of [-1, 1]) {
        cell.add(box(sideFloorWidth, 0.18, cellLength, floorSteel, side * sideFloorX, deckTop - 0.09, 0));
        cell.add(box(frameWidth, 0.18, endFloorLength, floorSteel, 0, deckTop - 0.09, side * (platformHalfLength + endFloorLength / 2)));
        for (const offset of [0.12, 0.22]) {
            cell.add(box(0.028, 0.006, 9, structure, side * (frameWidth / 2 + offset), deckTop + 0.003, 0));
        }
        for (const end of [-1, 1]) {
            const anchor = new THREE.Vector3(side * 1.26, deckTop + 0.04, end * 3.19);
            const chassis = new THREE.Vector3(side * 0.60, roadY + 0.39, bodyCenterZ + end * 1.97);
            const length = chassis.distanceTo(anchor);
            const strap = box(0.046, 0.01, length, restraint, 0, 0, 0);
            strap.position.copy(anchor).lerp(chassis, 0.5);
            strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), chassis.clone().sub(anchor).normalize());
            restraints.add(strap);
            cell.add(box(0.16, 0.05, 0.25, steel, anchor.x, deckTop + 0.025, anchor.z));
        }
        for (const axle of [-1, 1]) {
            const z = axle * halfWheelbase;
            const x = side * (frameWidth / 2 + 0.015);
            cell.add(box(0.19, deckDepth, 2 * windowHalfLength, floorSteel, side * (vehicle.rollerOutsideSpanM / 2 + 0.112), deckTop - deckDepth / 2, z));
            for (const end of [-1, 1]) {
                cell.add(box(0.035, 0.61, 0.035, guard, x, deckTop + 0.305, z + end * 0.34));
            }
            for (const y of [0.13, 0.60]) {
                cell.add(box(0.035, 0.035, 0.7, guard, x, deckTop + y, z));
            }
            for (let i = -6; i <= 6; i++) {
                cell.add(box(0.012, 0.45, 0.012, steel, x, deckTop + 0.36, z + i * 0.047));
            }
        }
    }
    const roomHeight = 3.35;
    const rearWall = box(cellWidth, roomHeight, 0.12, wall, 0, deckTop + roomHeight / 2, -cellLength / 2);
    const frontWall = new THREE.Group();
    frontWall.add(box(cellWidth, roomHeight, 0.12, wall, 0, deckTop + roomHeight / 2, cellLength / 2));
    cell.add(rearWall, frontWall);
    const modelWallX = -3.47;
    const modelWallZ = cellLength / 2 - 0.067;
    const modelWallY = deckTop + 1.20;
    const poster = document.createElement("canvas");
    poster.width = 1440;
    poster.height = 840;
    const ink = poster.getContext("2d");
    const symbol = (letter, subscript, exponent) => ({ letter, subscript, exponent });
    function paintPoster() {
        ink.fillStyle = "#f0f4f2";
        ink.fillRect(0, 0, poster.width, poster.height);
        ink.fillStyle = "#183747";
        ink.fillRect(0, 0, poster.width, 118);
        ink.fillStyle = "#81ddc7";
        ink.font = "bold 24px system-ui";
        ink.fillText(t("CHASSIS DYNAMOMETER"), 55, 38);
        ink.fillStyle = "#ffffff";
        ink.font = "bold 48px system-ui";
        ink.fillText(t("Longitudinal vehicle model"), 55, 91);
        ink.fillStyle = "#183747";
        function mathRow(runs, size, x, y = 0) {
            let width = 0;
            function write(text, fontSize, italic = false, rise = 0) {
                ink.font = `${italic ? "italic " : ""}${fontSize}px Georgia, serif`;
                if (x !== undefined)
                    ink.fillText(text, x + width, y - rise);
                return ink.measureText(text).width;
            }
            for (const run of runs) {
                if (typeof run === "string") {
                    width += write(run, size);
                }
                else {
                    width += write(run.letter, size, true);
                    const sub = run.subscript ? write(run.subscript, size * 0.65, false, -size * 0.19) : 0;
                    const sup = run.exponent ? write(run.exponent, size * 0.65, false, size * 0.48) : 0;
                    width += Math.max(sub, sup);
                }
            }
            return width;
        }
        function equation(parts, center, y, size = 48) {
            const widths = parts.map(part => Array.isArray(part) ? mathRow(part, size)
                : Math.max(mathRow(part.numerator, size), mathRow(part.denominator, size)) + 12);
            let x = center - widths.reduce((sum, width) => sum + width, 0) / 2;
            for (const [index, part] of parts.entries()) {
                const width = widths[index];
                if (Array.isArray(part)) {
                    mathRow(part, size, x, y);
                }
                else {
                    const barY = y - size * 0.24;
                    mathRow(part.numerator, size, x + (width - mathRow(part.numerator, size)) / 2, barY - size * 0.24);
                    ink.fillRect(x, barY, width, 2.5);
                    mathRow(part.denominator, size, x + (width - mathRow(part.denominator, size)) / 2, barY + size * 0.70);
                }
                x += width;
            }
        }
        function caption(label, x, y) {
            ink.font = "bold 28px system-ui";
            ink.fillText(t(label), x, y);
        }
        function definition(runs, label, x, y) {
            const width = mathRow(runs, 27, x, y);
            ink.font = "27px system-ui";
            ink.fillText(" – " + t(label), x + width, y);
        }
        const effectiveMass = symbol("m", "eff"), speed = symbol("v"), time = symbol("t");
        const motorForce = symbol("F", "m"), brakeForce = symbol("F", "f");
        const roadForce = symbol("F", "road"), gradeForce = symbol("F", "grade");
        const mass = symbol("m"), gravity = symbol("g"), angle = symbol("α");
        const packPower = symbol("P", "pack"), voltage = symbol("V"), current = symbol("I");
        const consumption = symbol("C", "100"), discharged = symbol("E", "out"), returned = symbol("E", "in");
        const distance = symbol("d");
        caption("FORCE BALANCE", 55, 157);
        equation([[effectiveMass, " "], { numerator: ["d", speed], denominator: ["d", time] },
            [" = ", motorForce, " − ", brakeForce, " − ", roadForce, " − ", gradeForce]], 720, 217, 55);
        definition([effectiveMass], "Effective mass, kg", 55, 271);
        definition([speed], "Speed, m/s", 535, 271);
        definition([time], "Time, s", 975, 271);
        definition([motorForce], "Motor force, N", 55, 306);
        definition([brakeForce], "Friction brake force, N", 535, 306);
        ink.fillText(t("Motor force is negative during regeneration."), 55, 341);
        caption("COASTDOWN ROAD LOAD", 55, 399);
        equation([[roadForce, " = ", symbol("A"), " + ", symbol("Bv"), " + ", symbol("C"), symbol("v", undefined, "2")]], 368, 457);
        definition([roadForce], "Road-load force, N", 55, 493);
        definition([symbol("A")], "Constant coefficient, N", 55, 528);
        definition([symbol("B")], "Linear coefficient, N·s/m", 55, 563);
        definition([symbol("C")], "Quadratic coefficient, N·s²/m²", 55, 598);
        caption("ROAD GRADE", 753, 399);
        equation([[gradeForce, " = ", mass, gravity, " sin ", angle]], 1068, 457);
        definition([gradeForce], "Grade force, N", 753, 493);
        definition([mass], "Vehicle mass, kg", 753, 528);
        definition([gravity], "Gravitational acceleration, m/s²", 753, 563);
        definition([angle], "Road angle, rad", 753, 598);
        caption("DC PACK POWER", 55, 635);
        equation([[packPower, " = ", voltage, current]], 368, 695);
        definition([packPower], "Net pack power, W", 55, 743);
        definition([voltage], "Terminal voltage, V", 55, 778);
        definition([current], "Pack current, A", 55, 813);
        caption("NET PACK CONSUMPTION", 753, 635);
        equation([[consumption, " = 100 × "], { numerator: [discharged, " − ", returned], denominator: [distance] }], 1068, 687);
        definition([consumption], "Consumption, kWh/100 km", 753, 743);
        definition([discharged, ", ", returned], "Discharged and returned energy, kWh", 753, 778);
        definition([distance], "Distance, km", 753, 813);
    }
    paintPoster();
    const posterMap = new THREE.CanvasTexture(poster);
    posterMap.colorSpace = THREE.SRGBColorSpace;
    posterMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const posterFace = new THREE.Mesh(new THREE.PlaneGeometry(2.18, 2.18 * poster.height / poster.width), new THREE.MeshBasicMaterial({ map: posterMap, toneMapped: false }));
    posterFace.rotation.y = Math.PI;
    posterFace.position.set(modelWallX, modelWallY, modelWallZ - 0.042);
    frontWall.add(box(2.24, 1.33, 0.043, structure, modelWallX, modelWallY, modelWallZ - 0.019), posterFace);
    const climateX = 3.42;
    const climateY = deckTop + 1.91;
    const climateZ = modelWallZ - 0.26;
    const climateUnit = new THREE.Group();
    climateUnit.name = "Test cell climate controller";
    climateUnit.visible = false;
    climateUnit.add(box(1.91, 1.00, 0.25, alloy, climateX, climateY + 0.12, climateZ + 0.12));
    climateUnit.add(box(1.77, 0.28, 0.03, structure, climateX, climateY + 0.414, climateZ - 0.015));
    for (const offset of [0.33, 0.38, 0.43, 0.48]) {
        climateUnit.add(box(1.64, 0.021, 0.03, steel, climateX, climateY + offset, climateZ - 0.035));
    }
    const climateScreen = document.createElement("canvas");
    climateScreen.width = 1000;
    climateScreen.height = 340;
    const climateInk = climateScreen.getContext("2d");
    const climateMap = new THREE.CanvasTexture(climateScreen);
    climateMap.colorSpace = THREE.SRGBColorSpace;
    const climateFace = new THREE.Mesh(new THREE.PlaneGeometry(1.73, 0.588), new THREE.MeshBasicMaterial({ map: climateMap, toneMapped: false }));
    climateFace.rotation.y = Math.PI;
    climateFace.position.set(climateX, climateY - 0.045, climateZ - 0.014);
    climateUnit.add(climateFace);
    frontWall.add(climateUnit);
    let chamber;
    function paintClimate(conditions) {
        climateInk.fillStyle = "#132a36";
        climateInk.fillRect(0, 0, 1000, 340);
        climateInk.fillStyle = "#d0e9f1";
        climateInk.font = "bold 41px system-ui";
        climateInk.textAlign = "left";
        climateInk.fillText(t("Test cell climate"), 38, 65);
        const readings = [
            [t("Thermometer"), conditions.temperatureC.toFixed(1), "°C"],
            [t("Hygrometer"), String(conditions.humidityPct), "%"],
            [t("Barometer"), conditions.pressureKpa.toFixed(3), t("kPa")],
        ];
        for (const [i, [label, value, unit]] of readings.entries()) {
            const x = 36 + i * 315;
            climateInk.fillStyle = "#223e4b";
            climateInk.fillRect(x, 103, 297, 196);
            climateInk.fillStyle = "#a9c8d2";
            climateInk.font = "31px system-ui";
            climateInk.textAlign = "center";
            climateInk.fillText(label, x + 148, 151);
            climateInk.fillStyle = "#75e2d1";
            climateInk.font = "bold 62px monospace";
            climateInk.fillText(value, x + 148, 230);
            climateInk.fillStyle = "#d0e9f1";
            climateInk.font = "31px system-ui";
            climateInk.fillText(unit, x + 148, 272);
        }
        climateMap.needsUpdate = true;
    }
    const sideWalls = [-1, 1].map((side) => {
        const assembly = new THREE.Group();
        assembly.add(box(0.12, roomHeight, cellLength, wall, side * cellWidth / 2, deckTop + roomHeight / 2, 0));
        assembly.add(box(0.06, 0.16, cellLength, steel, side * (cellWidth / 2 - 0.08), deckTop + 0.88, 0));
        for (const station of [-3.7, 0, 3.7]) {
            assembly.add(box(0.06, 0.08, 2.8, fixtureLight, side * (cellWidth / 2 - 0.10), deckTop + 2.72, station));
        }
        cell.add(assembly);
        return assembly;
    });
    frontWall.add(box(4.62, 1.17, 0.32, floorSteel, 0, deckTop + 2.64, cellLength / 2 - 0.22));
    const fanRotors = [];
    for (const x of [-1.45, 0, 1.45]) {
        const fan = new THREE.Group();
        fan.position.set(x, deckTop + 2.64, cellLength / 2 - 0.41);
        const opening = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.07, 40), rubber);
        opening.rotation.x = Math.PI / 2;
        const shroud = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.037, 10, 40), steel);
        shroud.position.z = -0.05;
        fan.add(opening, shroud);
        const rotor = new THREE.Group();
        rotor.name = "Cooling fan rotor";
        rotor.rotation.z = fanRotors.length * 0.16;
        for (let blade = 0; blade < 6; blade++) {
            const mount = new THREE.Group();
            mount.rotation.z = blade * Math.PI / 3;
            const vane = box(0.14, 0.28, 0.027, structure, 0, 0.23, -0.054);
            vane.rotation.z = 0.35;
            mount.add(vane);
            rotor.add(mount);
        }
        const hub = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 12), steel);
        hub.position.z = -0.065;
        rotor.add(hub);
        fan.add(rotor);
        fanRotors.push(rotor);
        frontWall.add(fan);
    }
    cell.add(box(1.55, 0.76, 0.60, structure, 0, deckTop + 0.38, 4.65));
    cell.add(box(1.36, 0.58, 0.02, rubber, 0, deckTop + 0.41, 4.34));
    for (let i = -5; i <= 5; i++) {
        cell.add(box(0.022, 0.58, 0.026, steel, i * 0.12, deckTop + 0.41, 4.32));
    }
    const cabinet = material(0x647882, 0.3, 0.58);
    for (const z of [-0.55, 0.25]) {
        cell.add(box(0.54, 1.78, 0.72, cabinet, -3.90, deckTop + 0.89, z));
        cell.add(box(0.022, 1.64, 0.64, structure, -3.618, deckTop + 0.90, z));
        cell.add(box(0.03, 0.10, 0.032, alloy, -3.59, deckTop + 0.93, z + 0.23));
        for (let slot = 0; slot < 5; slot++) {
            cell.add(box(0.023, 0.016, 0.41, rubber, -3.603, deckTop + 0.20 + 0.035 * slot, z));
        }
    }
    const stackColors = [
        { state: "running", on: 0x36f48a, off: 0x143929 },
        { state: "standby", on: 0xffbc35, off: 0x4a3617 },
        { state: "fault", on: 0xff3c4d, off: 0x431c26 },
    ];
    cell.add(box(0.12, 0.28, 0.12, steel, -3.87, deckTop + 1.90, -0.55));
    const stackLight = stackColors.map(({ state, on, off }, index) => {
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.08, 24), new THREE.MeshBasicMaterial({ color: state === "standby" ? on : off, toneMapped: false }));
        lens.name = "Signal tower " + state;
        lens.position.set(-3.87, deckTop + 2.08 + index * 0.096, -0.55);
        cell.add(lens, box(0.115, 0.016, 0.115, rubber, lens.position.x, lens.position.y - 0.048, lens.position.z));
        return lens;
    });
    cell.add(box(0.59, 0.92, 0.76, cabinet, -3.57, deckTop + 0.46, 2.58));
    cell.add(box(0.44, 0.025, 0.55, steel, -3.57, deckTop + 0.93, 2.58));
    cell.add(box(0.44, 0.74, 0.59, structure, 3.41, deckTop + 0.37, 1.93));
    cell.add(box(0.053, 0.09, 0.54, steel, 3.16, deckTop + 0.66, 1.93));
    const charger = new THREE.Group();
    charger.name = "Connected DC charger";
    charger.visible = false;
    cell.add(charger);
    const chargePort = new THREE.Vector3(0.88, roadY + 0.81, bodyCenterZ - 2.02);
    const chargerX = 3.44;
    const chargerZ = -1.86;
    const chargingSteel = material(0xb7c6cc, 0.31, 0.52);
    const chargingLamp = new THREE.MeshStandardMaterial({ color: 0x49dccc, emissive: 0x24a590, emissiveIntensity: 0.15 });
    charger.add(box(0.65, 0.08, 0.58, structure, chargerX, deckTop + 0.04, chargerZ), box(0.52, 1.32, 0.44, chargingSteel, chargerX, deckTop + 0.74, chargerZ), box(0.40, 0.56, 0.018, structure, chargerX, deckTop + 1.04, chargerZ - 0.22), box(0.29, 0.032, 0.024, chargingLamp, chargerX, deckTop + 1.25, chargerZ - 0.234));
    const chargeLabel = document.createElement("canvas");
    chargeLabel.width = 384;
    chargeLabel.height = 192;
    const chargeInk = chargeLabel.getContext("2d");
    chargeInk.fillStyle = "#102536";
    chargeInk.fillRect(0, 0, chargeLabel.width, chargeLabel.height);
    chargeInk.fillStyle = "#cde9f2";
    chargeInk.font = "bold 54px system-ui";
    chargeInk.textAlign = "center";
    chargeInk.fillText("150 kW", 192, 82);
    chargeInk.fillStyle = "#69dfce";
    chargeInk.font = "32px system-ui";
    chargeInk.fillText("DC", 192, 144);
    const chargeTexture = new THREE.CanvasTexture(chargeLabel);
    chargeTexture.colorSpace = THREE.SRGBColorSpace;
    const chargeDisplay = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.165), new THREE.MeshBasicMaterial({ map: chargeTexture, toneMapped: false }));
    chargeDisplay.rotation.y = Math.PI;
    chargeDisplay.position.set(chargerX, deckTop + 1.08, chargerZ - 0.232);
    charger.add(chargeDisplay);
    const cablePath = new THREE.CatmullRomCurve3([
        new THREE.Vector3(chargerX - 0.24, deckTop + 0.88, chargerZ),
        new THREE.Vector3(2.97, deckTop + 0.35, -1.96),
        new THREE.Vector3(2.30, deckTop + 0.10, -2.28),
        new THREE.Vector3(1.54, deckTop + 0.24, -2.40),
        chargePort.clone().add(new THREE.Vector3(0.34, -0.11, 0)),
        chargePort.clone().add(new THREE.Vector3(0.21, 0, 0)),
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(cablePath, 44, 0.026, 10, false), rubber);
    cable.name = "DC charge cable";
    const connector = box(0.27, 0.078, 0.082, structure, chargePort.x + 0.12, chargePort.y, chargePort.z);
    connector.name = "Tesla charge connector";
    charger.add(cable, connector, box(0.044, 0.10, 0.12, chargingSteel, chargePort.x + 0.012, chargePort.y, chargePort.z));
    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 720;
    screenCanvas.height = 480;
    const screenInk = screenCanvas.getContext("2d");
    const screenMap = new THREE.CanvasTexture(screenCanvas);
    screenMap.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 1.23), new THREE.MeshBasicMaterial({ map: screenMap, toneMapped: false }));
    screen.rotation.y = Math.PI;
    // +Z is forward and +X is the left-hand drive seat when viewed from the cabin.
    const screenZ = bodyCenterZ + vehicle.lengthM / 2 + 1.42;
    screen.position.set(0.34, roadY + 1.52, screenZ);
    cell.add(screen, box(1.94, 1.32, 0.09, structure, screen.position.x, screen.position.y, screenZ + 0.05));
    const railY = deckTop + 3.16;
    const screenTop = screen.position.y + 0.66;
    cell.add(box(cellWidth, 0.08, 0.10, steel, 0, railY, screenZ + 0.08));
    for (const offset of [-0.70, 0.70]) {
        cell.add(box(0.052, railY - screenTop, 0.07, steel, screen.position.x + offset, (railY + screenTop) / 2, screenZ + 0.08));
    }
    const battery = box(1.42, 0.15, 2.52, pack, 0, roadY + 0.205, -0.052);
    const batteryTrays = new THREE.Group();
    for (const x of [-0.53, -0.18, 0.18, 0.53]) {
        batteryTrays.add(box(0.32, 0.022, 2.38, material(0xffb954, 0.48), x, roadY + 0.282, -0.052));
    }
    vehicleMeshes.add(battery, batteryTrays);
    let yaw = 2.40;
    let elevation = 0.32;
    let range = 9.2;
    let dirty = true;
    let driverEye = false;
    let wallView = false;
    let batteryCutaway = false;
    const glassMats = new Set();
    const importedMaterials = new Map();
    let dragging;
    let chargeSelected = false;
    let chargingActive = false;
    let brakesApplied = false;
    const runningTailIntensity = 3.2;
    const brakingTailIntensity = 8;
    const brakeMaterials = new Set();
    const tailMaterials = new Set();
    const target = new THREE.Vector3(0, roadY - 0.08, 0);
    let fromDistance = 0;
    let toDistance = 0;
    let transitionStart = 0;
    let transitionMs = 0;
    let renderedDistance = 0;
    let rearOnly = true;
    let fanRate = 0;
    let lastFrame = performance.now();
    function setAxleAngles(distance) {
        for (const wheel of wheels) {
            wheel.rotation.x = rearOnly && wheel.position.z > 0 ? 0 : distance / vehicle.wheelRadiusM;
        }
        for (const roller of rollers) {
            roller.rotation.x = rearOnly && roller.position.z > 0 ? 0 : -distance / vehicle.rollerRadiusM;
        }
    }
    function interpolatedDistance(now) {
        if (transitionMs === 0)
            return toDistance;
        const fraction = Math.max(0, Math.min(1, (now - transitionStart) / transitionMs));
        return fromDistance + (toDistance - fromDistance) * fraction;
    }
    function updateView() {
        if (driverEye) {
            camera.position.set(46.94 * modelScaleX, roadY + 1.15, -0.14);
            camera.lookAt(screen.position.x, roadY + 1.16, screen.position.z);
        }
        else {
            const c = Math.cos(elevation);
            const distance = range * Math.max(1, 1.35 / camera.aspect);
            camera.position.set(target.x + distance * c * Math.sin(yaw), target.y + distance * Math.sin(elevation), target.z + distance * c * Math.cos(yaw));
            camera.lookAt(target);
        }
        camera.fov = driverEye ? Math.max(46, 38 / camera.aspect) : 36;
        camera.updateProjectionMatrix();
        rearWall.visible = camera.position.z >= 0;
        frontWall.visible = camera.position.z <= 0.5 || wallView;
        sideWalls[0].visible = camera.position.x >= 0 || wallView;
        sideWalls[1].visible = camera.position.x < 0;
        dirty = true;
    }
    function draw(now) {
        const frameS = Math.max(0, Math.min(0.05, (now - lastFrame) / 1000));
        lastFrame = now;
        if (fanRate && frameS) {
            for (const rotor of fanRotors)
                rotor.rotation.z = (rotor.rotation.z - fanRate * frameS) % (2 * Math.PI);
            if (frontWall.visible && cell.visible)
                dirty = true;
        }
        const distance = interpolatedDistance(now);
        const travel = transitionMs === 0 ? 0 : Math.abs(distance - renderedDistance);
        const wheelSweep = travel / vehicle.wheelRadiusM;
        const drumSweep = travel / vehicle.rollerRadiusM;
        // Blend fine rotating details into a smooth surface when frames undersample them.
        const blur = Math.max(0, Math.min(1, (wheelSweep - 0.28) / 0.85));
        const opacity = 0.58 * blur;
        const drumMarkOpacity = 1 - 0.40 * Math.max(0, Math.min(1, (drumSweep - 0.4) / 1.6));
        if (distance !== renderedDistance || motionDisc.opacity !== opacity || rollerMark.opacity !== drumMarkOpacity) {
            setAxleAngles(distance);
            renderedDistance = distance;
            motionDisc.opacity = opacity;
            wheelMark.opacity = 1 - 0.75 * blur;
            rollerMark.opacity = drumMarkOpacity;
            dirty = true;
        }
        if (dirty) {
            renderer.render(scene, camera);
            dirty = false;
        }
        requestAnimationFrame(draw);
    }
    new ResizeObserver(() => {
        const { width, height } = canvas.getBoundingClientRect();
        if (!width || !height)
            return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        updateView();
    }).observe(canvas);
    canvas.addEventListener("contextmenu", (event) => {
        if (!driverEye && !wallView)
            event.preventDefault();
    });
    canvas.addEventListener("pointerdown", (event) => {
        if (driverEye || wallView || ![0, 1, 2].includes(event.button))
            return;
        dragging = { x: event.clientX, y: event.clientY, pan: event.shiftKey || event.button !== 0 };
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
        if (!dragging)
            return;
        const dx = event.clientX - dragging.x;
        const dy = event.clientY - dragging.y;
        if (dragging.pan) {
            const metresPerPixel = 2 * camera.position.distanceTo(target)
                * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / canvas.clientHeight;
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
            target.addScaledVector(right, -dx * metresPerPixel).addScaledVector(up, dy * metresPerPixel);
        }
        else {
            yaw -= dx * 0.007;
            elevation = Math.min(1.48, Math.max(0.07, elevation + dy * 0.006));
        }
        dragging.x = event.clientX;
        dragging.y = event.clientY;
        updateView();
    });
    for (const event of ["lostpointercapture", "pointerup", "pointercancel"]) {
        canvas.addEventListener(event, () => { dragging = undefined; });
    }
    canvas.addEventListener("wheel", (event) => {
        if (driverEye || wallView)
            return;
        event.preventDefault();
        range = Math.min(15, Math.max(5, range + event.deltaY * 0.008));
        updateView();
    }, { passive: false });
    updateView();
    draw(performance.now());
    function updateGlass() {
        for (const [mat, original] of importedMaterials) {
            const windshield = driverEye && glassMats.has(mat);
            mat.transparent = batteryCutaway || windshield || original.transparent;
            mat.opacity = batteryCutaway ? Math.min(0.20, original.opacity) : windshield ? 0.08 : original.opacity;
            mat.depthWrite = !batteryCutaway && !windshield && original.depthWrite;
            mat.needsUpdate = true;
        }
    }
    let monitorText = "";
    let benchLight = "standby";
    return {
        refreshLabels() {
            paintPoster();
            posterMap.needsUpdate = true;
            if (chamber)
                paintClimate(chamber);
            monitorText = "";
            dirty = true;
        },
        rollerSetup(onlyRear) {
            rearOnly = onlyRear;
            frontPlate.visible = onlyRear;
            for (const disc of frontMotionDiscs)
                disc.visible = !onlyRear;
            setAxleAngles(renderedDistance);
            dirty = true;
        },
        animate(distanceM, durationMs) {
            const now = performance.now();
            fromDistance = interpolatedDistance(now);
            toDistance = distanceM;
            transitionStart = now;
            transitionMs = durationMs;
        },
        view(view) {
            driverEye = view === "eye";
            wallView = view === "wall" || view === "climate";
            if (view === "climate")
                target.set(climateX, climateY + 0.12, climateZ);
            else if (view === "wall")
                target.set(modelWallX, deckTop + 1.64, modelWallZ);
            else if (view === "side")
                target.set(0, roadY + 0.36, 0);
            else
                target.set(0, roadY - 0.08, 0);
            if (driverEye || wallView)
                cell.visible = true;
            if (wallView) {
                yaw = Math.PI;
                elevation = 0;
            }
            else if (view === "side") {
                yaw = Math.PI / 2 - 0.07;
                elevation = 0.19;
            }
            else if (view === "top") {
                yaw = 0;
                elevation = 1.48;
            }
            else if (view === "station") {
                yaw = 2.40;
                elevation = 0.32;
            }
            else {
                yaw = -0.75;
                elevation = 0.34;
            }
            range = view === "climate" ? 2.3 : wallView ? 4.1 : view === "side" ? 8.4 : 9.2;
            updateGlass();
            updateView();
        },
        climate(conditions) {
            if (chamber && conditions.temperatureC === chamber.temperatureC
                && conditions.humidityPct === chamber.humidityPct && conditions.pressureKpa === chamber.pressureKpa)
                return;
            chamber = conditions;
            climateUnit.visible = true;
            paintClimate(conditions);
            dirty = true;
        },
        charging(selected, active) {
            if (selected === chargeSelected && active === chargingActive)
                return;
            chargeSelected = selected;
            chargingActive = active;
            charger.visible = selected && vehicleMeshes.parent === scene;
            chargingLamp.emissiveIntensity = active ? 2 : 0.15;
            dirty = true;
        },
        brakeLights(active) {
            if (active === brakesApplied)
                return;
            brakesApplied = active;
            for (const lamp of brakeMaterials)
                lamp.emissiveIntensity = active ? 3 : 0;
            for (const lamp of tailMaterials)
                lamp.emissiveIntensity = active ? brakingTailIntensity : runningTailIntensity;
            tailStrip.color.setHex(active ? 0xff7975 : 0xf52f42);
            dirty = true;
        },
        coolingFans(active, speedKph = 0) {
            fanRate = active ? 5 + Math.min(14, speedKph * 0.11) : 0;
        },
        benchStatus(state) {
            if (state === benchLight)
                return;
            benchLight = state;
            stackColors.forEach(({ state: lensState, on, off }, i) => {
                stackLight[i].material.color.setHex(state === lensState ? on : off);
            });
            dirty = true;
        },
        monitor(speed, targetKph, trace, timeS = 0) {
            const actual = speed.toFixed(1);
            const targetSpeed = targetKph?.toFixed(1) ?? "—";
            const text = trace ? actual + "/" + targetSpeed + "/" + timeS : actual + "/" + targetSpeed;
            if (text === monitorText)
                return;
            monitorText = text;
            screenInk.fillStyle = "#121e29";
            screenInk.fillRect(0, 0, screenCanvas.width, screenCanvas.height);
            if (targetKph === null) {
                const center = screenCanvas.width / 2;
                screenInk.save();
                screenInk.textAlign = "center";
                screenInk.fillStyle = "#e0ecf7";
                screenInk.font = "600 36px system-ui";
                screenInk.fillText(t("Vehicle speed"), center, 126);
                screenInk.fillStyle = "#63e1cb";
                screenInk.font = "bold 172px system-ui";
                screenInk.fillText(actual, center, 293);
                screenInk.fillStyle = "#e0ecf7";
                screenInk.font = "38px system-ui";
                screenInk.fillText(t("km/h"), center, 354);
                screenInk.restore();
            }
            else {
                screenInk.font = "bold 30px system-ui";
                screenInk.fillStyle = "#63e1cb";
                screenInk.fillText(t("Actual readout") + " " + actual + " " + t("km/h"), 24, 42);
                screenInk.fillStyle = "#e0ecf7";
                screenInk.fillText(t("Target readout") + " " + targetSpeed + " " + t("km/h"), 357, 42);
            }
            if (trace) {
                const guideScale = 1.35;
                screenInk.save();
                screenInk.translate(0, 56);
                screenInk.scale(guideScale, guideScale);
                trace(screenInk, screenCanvas.width / guideScale, (screenCanvas.height - 56) / guideScale);
                screenInk.restore();
            }
            screenMap.needsUpdate = true;
            dirty = true;
        },
        pit(open) {
            cell.visible = !open;
            dirty = true;
        },
        cutaway(showPack) {
            batteryCutaway = showPack;
            vehicleLights.visible = !showPack;
            updateGlass();
            dirty = true;
        },
        async loadPack() {
            const loaderPath = "../vendor/three/STLLoader.js";
            const { STLLoader } = await import(loaderPath);
            const geometry = await new STLLoader().loadAsync("./models/tesla-pack.stl");
            // Source has millimetres, mounting floor at Z = 0 and the raised section at the rear.
            geometry.scale(0.001, 0.001, 0.001);
            geometry.rotateX(-Math.PI / 2);
            geometry.rotateY(Math.PI);
            geometry.computeBoundingBox();
            const bounds = geometry.boundingBox;
            geometry.translate(0, -bounds.min.y, -(bounds.max.z + bounds.min.z) / 2);
            const measuredPack = new THREE.Mesh(geometry, material(0x9ca9b4, 0.45, 0.57));
            measuredPack.position.y = roadY + vehicle.groundClearanceM;
            vehicleMeshes.add(measuredPack);
            vehicleMeshes.remove(battery, batteryTrays);
            dirty = true;
        },
        async loadWallLogo() {
            const texture = await new THREE.TextureLoader().loadAsync("./department.png");
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            const width = 2.55;
            const logo = new THREE.Mesh(new THREE.PlaneGeometry(width, width * texture.image.height / texture.image.width), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }));
            logo.name = "Department wall logo";
            logo.rotation.y = Math.PI;
            logo.position.set(modelWallX, deckTop + 2.39, modelWallZ - 0.003);
            frontWall.add(logo);
            canvas.dataset.wallLogo = "transport-department";
            dirty = true;
        },
        async loadVehicle() {
            const loaderPath = "../vendor/three/loaders/GLTFLoader.js";
            const { GLTFLoader } = await import(loaderPath);
            const { scene: source, parser } = await new GLTFLoader().loadAsync("./models/tesla_2018_model_3.glb");
            // Three.js sanitizes glTF node names. Resolve the original names through the parser.
            const modelNode = (name) => {
                const index = parser.json.nodes.findIndex((node) => node.name === name);
                if (index < 0)
                    throw new Error("Missing Tesla model node " + name);
                return parser.getDependency("node", index);
            };
            const [rearAxle, frontAxle, sourceWheels, rearPlateLetters] = await Promise.all([
                modelNode("wheels.001"), modelNode("wheels"), modelNode("wheel_rf_dummy"), modelNode("platnomor_platnomor.2_0"),
            ]);
            const axleMeshes = [rearAxle, frontAxle];
            source.updateMatrixWorld(true);
            // The asset has two axle groups with both wheels in each. Split their triangles at X = 0
            // and mount each wheel on the existing simulated hub to retain the tire/drum contact.
            const tireCenters = [-144.7204, 175.6810];
            const tireRadii = [37.988, 37.3135];
            const tireYCentre = -37.1709;
            const baseY = vehicle.wheelRadiusM / ((tireRadii[0] + tireRadii[1]) / 2);
            const baseZ = vehicle.wheelbaseM / (tireCenters[1] - tireCenters[0]);
            const midAxleZ = (tireCenters[0] + tireCenters[1]) / 2;
            const basis = new THREE.Matrix4().set(-modelScaleX, 0, 0, 0, 0, baseY, 0, wheelY - tireYCentre * baseY, 0, 0, -baseZ, -midAxleZ * baseZ, 0, 0, 0, 1);
            const importedWheels = wheels.map(() => new THREE.Group());
            axleMeshes.forEach((axle, axleIndex) => {
                const wheelScale = vehicle.wheelRadiusM / tireRadii[axleIndex];
                axle.traverse((mesh) => {
                    if (!mesh.isMesh)
                        return;
                    const world = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
                    const positions = world.getAttribute("position");
                    const indices = world.index;
                    const count = indices ? indices.count : positions.count;
                    const left = [], right = [];
                    for (let k = 0; k < count; k += 3) {
                        const a = indices ? indices.getX(k) : k;
                        const b = indices ? indices.getX(k + 1) : k + 1;
                        const c = indices ? indices.getX(k + 2) : k + 2;
                        const side = positions.getX(a) + positions.getX(b) + positions.getX(c) > 0 ? left : right;
                        side.push(a, b, c);
                    }
                    for (const [side, triangles] of [left, right].entries()) {
                        if (!triangles.length)
                            continue;
                        const geometry = world.clone();
                        geometry.setIndex(triangles);
                        geometry.translate(side === 0 ? -tireXCentre : tireXCentre, -tireYCentre, tireCenters[axleIndex]);
                        geometry.scale(modelScaleX, wheelScale, wheelScale);
                        geometry.rotateY(Math.PI);
                        importedWheels[side * axleMeshes.length + axleIndex].add(new THREE.Mesh(geometry, mesh.material));
                    }
                    world.dispose();
                });
            });
            if (importedWheels.some((wheel) => !wheel.children.length))
                throw new Error("Tesla wheel parts are incomplete");
            sourceWheels.removeFromParent();
            source.traverse((node) => {
                if (!node.isMesh)
                    return;
                if (/^tembus_(boot_ok|belakang)_/.test(node.name)) {
                    const lens = node.material.clone();
                    lens.color.setHex(0x8a0a10);
                    lens.emissive.setHex(0xff081f);
                    lens.emissiveMap = lens.map;
                    lens.emissiveIntensity = brakesApplied ? brakingTailIntensity : runningTailIntensity;
                    lens.toneMapped = false;
                    lens.opacity = 0.84;
                    tailMaterials.add(lens);
                    node.material = lens;
                }
                for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
                    if (/^glass/i.test(mat.name))
                        glassMats.add(mat);
                    if (!mat.isMeshStandardMaterial) {
                        importedMaterials.set(mat, { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite });
                        continue;
                    }
                    if (/^(left|right)_front_light$/.test(mat.name)) {
                        mat.emissive.setHex(0xe4f3ff);
                        mat.emissiveIntensity = 1.5;
                        mat.emissiveMap = null;
                    }
                    else if (/^(left|right)_rear_light$/.test(mat.name)) {
                        mat.color.setHex(0x780d16);
                        mat.emissive.setHex(0xff081f);
                        mat.emissiveIntensity = brakesApplied ? brakingTailIntensity : runningTailIntensity;
                        mat.emissiveMap = null;
                        tailMaterials.add(mat);
                    }
                    else if (mat.name === "breaklight_l") {
                        mat.emissive.setHex(0xff0d23);
                        mat.emissiveIntensity = brakesApplied ? 3 : 0;
                        mat.emissiveMap = null;
                        brakeMaterials.add(mat);
                    }
                    else if (/^tembus_(depan_ok|red)_/.test(node.name)) {
                        mat.opacity = 0.36;
                    }
                    importedMaterials.set(mat, { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite });
                }
            });
            source.applyMatrix4(basis);
            vehicleMeshes.add(source);
            rearPlateLetters.visible = false;
            const plateCanvas = document.createElement("canvas");
            plateCanvas.width = 512;
            plateCanvas.height = 112;
            const plateContext = plateCanvas.getContext("2d");
            plateContext.fillStyle = "#17212b";
            plateContext.fillRect(0, 0, plateCanvas.width, plateCanvas.height);
            plateContext.fillStyle = "#f5f6f3";
            plateContext.fillRect(5, 5, plateCanvas.width - 10, plateCanvas.height - 10);
            plateContext.fillStyle = "#17212b";
            plateContext.font = "bold 86px monospace";
            plateContext.textAlign = "center";
            plateContext.textBaseline = "middle";
            plateContext.fillText(vehicle.plate, plateCanvas.width / 2, plateCanvas.height / 2 + 2);
            const plateMap = new THREE.CanvasTexture(plateCanvas);
            plateMap.colorSpace = THREE.SRGBColorSpace;
            plateMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            const plateFace = new THREE.PlaneGeometry(0.46, 0.101);
            const plateMaterial = new THREE.MeshBasicMaterial({ map: plateMap, toneMapped: false });
            // Positions and positive tilt follow the imported front bumper and rear mount.
            for (const [name, height, z, tilt, angle] of [
                ["Front simulation plate", 0.51, 2.225, 0.067, 0],
                ["Rear simulation plate", 0.747, -2.432, 0.28, Math.PI],
            ]) {
                const plate = new THREE.Mesh(plateFace, plateMaterial);
                plate.name = name;
                plate.position.set(0, roadY + height, z);
                plate.rotation.set(tilt, angle, 0);
                vehicleMeshes.add(plate);
            }
            const headStrip = new THREE.MeshBasicMaterial({ color: 0xf0faff, toneMapped: false });
            // Points follow the imported lamp covers. Height is measured from the roller surface.
            const headLens = [[0.45, 0.63, 2.065], [0.49, 0.63, 2.048], [0.57, 0.65, 2.001],
                [0.65, 0.67, 1.951], [0.73, 0.71, 1.861], [0.77, 0.73, 1.785]];
            const tailLens = [[0.41, 0.89, -2.354], [0.45, 0.91, -2.336], [0.49, 0.93, -2.316],
                [0.57, 0.95, -2.273], [0.65, 0.95, -2.223], [0.73, 0.93, -2.157],
                [0.77, 0.89, -2.089], [0.78, 0.85, -2.095]];
            for (const side of [-1, 1]) {
                for (const [points, direction, lightMaterial] of [[headLens, 1, headStrip], [tailLens, -1, tailStrip]]) {
                    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(side * x, roadY + y, z + direction * 0.006)));
                    vehicleLights.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.008, 8, false), lightMaterial));
                }
                const lamp = new THREE.SpotLight(0xe4f2ff, 120, 7, 0.29, 0.55);
                lamp.name = "Tesla dipped headlamp";
                lamp.position.set(side * 0.55, roadY + 0.65, 1.94);
                lamp.target.position.set(side * 0.56, roadY - 0.10, 5.70);
                vehicleLights.add(lamp, lamp.target);
            }
            vehicleMeshes.add(vehicleLights);
            wheels.forEach((wheel, index) => {
                const witness = drivenWheelMarks.get(wheel);
                const mesh = importedWheels[index];
                if (witness) {
                    const bounds = new THREE.Box3().setFromObject(mesh);
                    witness.position.x = wheel.position.x < 0 ? bounds.min.x - 0.004 : bounds.max.x + 0.004;
                }
                wheel.add(mesh);
            });
            scene.add(vehicleMeshes);
            restraints.visible = true;
            charger.visible = chargeSelected;
            canvas.dataset.vehicleModel = "tesla-2018-model-3";
            updateGlass();
            updateView();
        },
    };
}
