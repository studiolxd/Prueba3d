import { useEffect, useRef } from "react";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  SceneLoader,
  DirectionalLight,
  ShadowGenerator,
  type AbstractMesh,
  type AnimationGroup,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

export default function BabylonScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const joystickRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor.set(0.529, 0.808, 0.922, 1);

    // Camera - follows player from behind
    const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 8, Vector3.Zero(), scene);
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 15;
    camera.lowerBetaLimit = 0.3;
    camera.upperBetaLimit = Math.PI / 2.2;
    camera.attachControl(canvas, true);
    // Pinch zoom on mobile
    camera.pinchPrecision = 50;

    // Lights
    const hemiLight = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.5;

    const dirLight = new DirectionalLight("dir", new Vector3(-1, -2, 1), scene);
    dirLight.position = new Vector3(5, 10, -5);
    dirLight.intensity = 0.8;

    // Shadows
    const shadowGen = new ShadowGenerator(1024, dirLight);
    shadowGen.useBlurExponentialShadowMap = true;

    // Ground
    const ground = MeshBuilder.CreateGround("ground", { width: 20, height: 20 }, scene);
    const groundMat = new StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new Color3(0.4, 0.75, 0.4);
    ground.material = groundMat;
    ground.receiveShadows = true;

    // Movement state
    let joystickDir = { x: 0, z: 0 };
    const speed = 0.06;
    let playerRoot: AbstractMesh | null = null;
    let idleAnim: AnimationGroup | null = null;
    let walkAnim: AnimationGroup | null = null;
    let isWalking = false;

    // Load player
    SceneLoader.ImportMeshAsync("", "/", "player.glb", scene).then((result) => {
      playerRoot = result.meshes[0];
      playerRoot.position = new Vector3(0, 0, 0);
      playerRoot.scaling.setAll(1);

      result.meshes.forEach((m) => {
        shadowGen.addShadowCaster(m);
      });

      const anims = result.animationGroups;
      if (anims.length > 0) {
        anims.forEach((a) => a.stop());
        idleAnim = anims.find((a) => /idle/i.test(a.name)) ?? anims[0];
        walkAnim = anims.find((a) => /walk|run/i.test(a.name)) ?? (anims.length > 1 ? anims[1] : null);
        idleAnim.start(true);
      }
    });

    // Game loop
    scene.onBeforeRenderObservable.add(() => {
      if (!playerRoot) return;

      const hasInput = Math.abs(joystickDir.x) > 0.01 || Math.abs(joystickDir.z) > 0.01;

      if (hasInput) {
        // Move relative to camera orientation
        const cameraAngle = camera.alpha + Math.PI / 2;
        const cos = Math.cos(cameraAngle);
        const sin = Math.sin(cameraAngle);
        const worldX = joystickDir.x * cos - joystickDir.z * sin;
        const worldZ = joystickDir.x * sin + joystickDir.z * cos;

        playerRoot.position.x += worldX * speed;
        playerRoot.position.z += worldZ * speed;

        // Clamp to ground
        playerRoot.position.x = Math.max(-9.5, Math.min(9.5, playerRoot.position.x));
        playerRoot.position.z = Math.max(-9.5, Math.min(9.5, playerRoot.position.z));

        // Rotate player to face movement direction
        const angle = Math.atan2(worldX, worldZ);
        playerRoot.rotation.y = angle;

        if (!isWalking && walkAnim) {
          idleAnim?.stop();
          walkAnim.start(true);
          isWalking = true;
        }
      } else {
        if (isWalking) {
          walkAnim?.stop();
          idleAnim?.start(true);
          isWalking = false;
        }
      }

      // Camera follows player smoothly
      camera.target = playerRoot.position;
    });

    // --- Virtual joystick ---
    const joystickEl = joystickRef.current!;
    const knob = joystickEl.querySelector(".joystick-knob") as HTMLDivElement;
    let joystickActive = false;
    let joystickTouchId: number | null = null;
    let joystickCenter = { x: 0, y: 0 };
    const joystickRadius = 50;

    function handleJoystickStart(e: TouchEvent) {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.changedTouches[0];
      joystickTouchId = touch.identifier;
      joystickActive = true;
      const rect = joystickEl.getBoundingClientRect();
      joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      updateJoystick(touch.clientX, touch.clientY);
    }

    function handleJoystickMove(e: TouchEvent) {
      if (!joystickActive) return;
      e.preventDefault();
      e.stopPropagation();
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === joystickTouchId) {
          updateJoystick(e.touches[i].clientX, e.touches[i].clientY);
          break;
        }
      }
    }

    function updateJoystick(clientX: number, clientY: number) {
      let dx = clientX - joystickCenter.x;
      let dy = clientY - joystickCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > joystickRadius) {
        dx = (dx / dist) * joystickRadius;
        dy = (dy / dist) * joystickRadius;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      joystickDir = { x: dx / joystickRadius, z: -dy / joystickRadius };
    }

    function handleJoystickEnd(e: TouchEvent) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
          e.preventDefault();
          e.stopPropagation();
          joystickActive = false;
          joystickTouchId = null;
          knob.style.transform = "translate(0px, 0px)";
          joystickDir = { x: 0, z: 0 };
          break;
        }
      }
    }

    joystickEl.addEventListener("touchstart", handleJoystickStart, { passive: false });
    joystickEl.addEventListener("touchmove", handleJoystickMove, { passive: false });
    joystickEl.addEventListener("touchend", handleJoystickEnd, { passive: false });
    joystickEl.addEventListener("touchcancel", handleJoystickEnd, { passive: false });

    // Keyboard (desktop)
    const keys = new Set<string>();
    function onKeyDown(e: KeyboardEvent) {
      keys.add(e.key.toLowerCase());
      updateKeysDir();
    }
    function onKeyUp(e: KeyboardEvent) {
      keys.delete(e.key.toLowerCase());
      updateKeysDir();
    }
    function updateKeysDir() {
      let x = 0, z = 0;
      if (keys.has("w") || keys.has("arrowup")) z = 1;
      if (keys.has("s") || keys.has("arrowdown")) z = -1;
      if (keys.has("a") || keys.has("arrowleft")) x = -1;
      if (keys.has("d") || keys.has("arrowright")) x = 1;
      if (x !== 0 && z !== 0) {
        const len = Math.sqrt(x * x + z * z);
        x /= len;
        z /= len;
      }
      joystickDir = { x, z };
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    engine.runRenderLoop(() => scene.render());

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      joystickEl.removeEventListener("touchstart", handleJoystickStart);
      joystickEl.removeEventListener("touchmove", handleJoystickMove);
      joystickEl.removeEventListener("touchend", handleJoystickEnd);
      joystickEl.removeEventListener("touchcancel", handleJoystickEnd);
      engine.dispose();
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100dvh", overflow: "hidden", touchAction: "none" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {/* Virtual joystick - stopPropagation prevents camera from reacting */}
      <div
        ref={joystickRef}
        style={{
          position: "absolute",
          bottom: 40,
          left: 40,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.25)",
          border: "2px solid rgba(255,255,255,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
        }}
      >
        <div
          className="joystick-knob"
          style={{
            width: 50,
            height: 50,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.6)",
            border: "2px solid rgba(255,255,255,0.8)",
            transition: "transform 0.05s",
            pointerEvents: "none",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          color: "white",
          background: "rgba(0,0,0,0.4)",
          padding: "6px 16px",
          borderRadius: 8,
          fontSize: 14,
          pointerEvents: "none",
        }}
      >
        WASD / Arrows · Joystick on mobile · Drag to rotate camera
      </div>
    </div>
  );
}
