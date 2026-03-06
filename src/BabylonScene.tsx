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
    scene.clearColor.set(0.529, 0.808, 0.922, 1); // sky blue

    // Camera
    const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 8, Vector3.Zero(), scene);
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 15;
    camera.lowerBetaLimit = 0.3;
    camera.upperBetaLimit = Math.PI / 2.2;
    camera.attachControl(canvas, true);

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
    let moveDir = { x: 0, z: 0 };
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

      // Add shadows for all child meshes
      result.meshes.forEach((m) => {
        shadowGen.addShadowCaster(m);
      });

      // Try to find idle/walk animations
      const anims = result.animationGroups;
      if (anims.length > 0) {
        // Stop all first
        anims.forEach((a) => a.stop());

        // Try to find by name
        idleAnim = anims.find((a) => /idle/i.test(a.name)) ?? anims[0];
        walkAnim = anims.find((a) => /walk|run/i.test(a.name)) ?? (anims.length > 1 ? anims[1] : null);

        idleAnim.start(true);
      }

      camera.target = playerRoot.position;
    });

    // Game loop - move player
    scene.onBeforeRenderObservable.add(() => {
      if (!playerRoot) return;

      const hasInput = Math.abs(moveDir.x) > 0.01 || Math.abs(moveDir.z) > 0.01;

      if (hasInput) {
        // Move
        playerRoot.position.x += moveDir.x * speed;
        playerRoot.position.z += moveDir.z * speed;

        // Clamp to ground bounds
        playerRoot.position.x = Math.max(-9.5, Math.min(9.5, playerRoot.position.x));
        playerRoot.position.z = Math.max(-9.5, Math.min(9.5, playerRoot.position.z));

        // Rotate to face movement direction
        const angle = Math.atan2(moveDir.x, moveDir.z);
        playerRoot.rotation = new Vector3(0, angle, 0);

        // Switch to walk animation
        if (!isWalking && walkAnim) {
          idleAnim?.stop();
          walkAnim.start(true);
          isWalking = true;
        }
      } else {
        // Switch to idle animation
        if (isWalking) {
          walkAnim?.stop();
          idleAnim?.start(true);
          isWalking = false;
        }
      }

      // Camera follows player
      camera.target.copyFrom(playerRoot.position);
    });

    // --- Virtual joystick (touch controls) ---
    const joystickEl = joystickRef.current!;
    const knob = joystickEl.querySelector(".joystick-knob") as HTMLDivElement;
    let joystickActive = false;
    let joystickCenter = { x: 0, y: 0 };
    const joystickRadius = 50;

    function handleJoystickStart(e: TouchEvent) {
      e.preventDefault();
      joystickActive = true;
      const rect = joystickEl.getBoundingClientRect();
      joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      handleJoystickMove(e);
    }

    function handleJoystickMove(e: TouchEvent) {
      if (!joystickActive) return;
      e.preventDefault();
      const touch = e.touches[0];
      let dx = touch.clientX - joystickCenter.x;
      let dy = touch.clientY - joystickCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > joystickRadius) {
        dx = (dx / dist) * joystickRadius;
        dy = (dy / dist) * joystickRadius;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      moveDir = { x: dx / joystickRadius, z: -dy / joystickRadius };
    }

    function handleJoystickEnd(e: TouchEvent) {
      e.preventDefault();
      joystickActive = false;
      knob.style.transform = "translate(0px, 0px)";
      moveDir = { x: 0, z: 0 };
    }

    joystickEl.addEventListener("touchstart", handleJoystickStart, { passive: false });
    joystickEl.addEventListener("touchmove", handleJoystickMove, { passive: false });
    joystickEl.addEventListener("touchend", handleJoystickEnd, { passive: false });

    // Keyboard support (for desktop testing)
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
      // Normalize diagonal
      if (x !== 0 && z !== 0) {
        const len = Math.sqrt(x * x + z * z);
        x /= len;
        z /= len;
      }
      moveDir = { x, z };
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Render loop
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
      engine.dispose();
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100dvh", overflow: "hidden", touchAction: "none" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {/* Virtual joystick */}
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
      {/* Desktop hint */}
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
        WASD / Arrows to move · Touch joystick on mobile
      </div>
    </div>
  );
}
