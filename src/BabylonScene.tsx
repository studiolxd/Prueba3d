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

    // Camera — third person behind and above the player
    const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3.5, 5, new Vector3(0, 1, 0), scene);
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 12;
    camera.lowerBetaLimit = 0.3;
    camera.upperBetaLimit = Math.PI / 2.2;
    camera.attachControl(canvas, true);
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

    // Animations
    let idleAnim: AnimationGroup | null = null;
    let walkAnim: AnimationGroup | null = null;
    let turnLeftAnim: AnimationGroup | null = null;
    let turnRightAnim: AnimationGroup | null = null;
    let currentAnim: AnimationGroup | null = null;

    function playAnim(anim: AnimationGroup | null) {
      if (!anim || anim === currentAnim) return;
      currentAnim?.stop();
      anim.start(true);
      currentAnim = anim;
    }

    // Retarget animation group: remap bone names from underscore (idle.glb)
    // to colon (player4.glb) so animations target the correct skeleton nodes
    function retargetAnim(anim: AnimationGroup) {
      for (const ta of anim.targetedAnimations) {
        const target = ta.target;
        if (target && target.name && typeof target.name === "string") {
          // Find the matching node in the scene with colon naming
          const colonName = target.name.replace(/^(mixamorig2)_/, "$1:");
          const sceneNode = scene.getTransformNodeByName(colonName);
          if (sceneNode) {
            ta.target = sceneNode;
          }
        }
      }
    }

    // Load player model + separate animation files
    async function loadPlayer() {
      // Load the base character (player4.glb has mesh + skin + skeleton)
      const playerResult = await SceneLoader.ImportMeshAsync("", "/", "player4.glb", scene);
      playerRoot = playerResult.meshes[0];
      playerRoot.position = new Vector3(0, 0, 0);
      // player4.glb is exported with 0.01 scale and 90° X rotation from FBX
      // Correct: scale up to 1 and remove the X rotation
      playerRoot.scaling.setAll(100);
      playerRoot.rotation = new Vector3(0, 0, 0);

      playerResult.meshes.forEach((m) => shadowGen.addShadowCaster(m));

      // Stop embedded animation
      playerResult.animationGroups.forEach((a) => a.stop());

      // Load animation-only files (same Mixamo skeleton, different name convention)
      const [idleResult, walkResult, leftResult, rightResult] = await Promise.all([
        SceneLoader.ImportMeshAsync("", "/", "idle.glb", scene),
        SceneLoader.ImportMeshAsync("", "/", "walking.glb", scene),
        SceneLoader.ImportMeshAsync("", "/", "left turn.glb", scene),
        SceneLoader.ImportMeshAsync("", "/", "right turn.glb", scene),
      ]);

      // Hide meshes from animation files (they have no skin anyway)
      [idleResult, walkResult, leftResult, rightResult].forEach((r) => {
        r.meshes.forEach((m) => {
          m.isVisible = false;
          m.setEnabled(false);
        });
      });

      // Get animation groups and retarget to player4 skeleton
      idleAnim = idleResult.animationGroups[0] ?? null;
      walkAnim = walkResult.animationGroups[0] ?? null;
      turnLeftAnim = leftResult.animationGroups[0] ?? null;
      turnRightAnim = rightResult.animationGroups[0] ?? null;

      [idleAnim, walkAnim, turnLeftAnim, turnRightAnim].forEach((a) => {
        if (a) {
          a.stop();
          retargetAnim(a);
        }
      });

      playAnim(idleAnim);
    }

    loadPlayer();

    // Game loop
    scene.onBeforeRenderObservable.add(() => {
      if (!playerRoot) return;

      const hasInput = Math.abs(joystickDir.x) > 0.01 || Math.abs(joystickDir.z) > 0.01;
      const isTurning = Math.abs(joystickDir.x) > 0.5 && Math.abs(joystickDir.z) < 0.3;

      if (hasInput) {
        // Move relative to camera orientation
        const cameraAngle = camera.alpha + Math.PI / 2;
        const cos = Math.cos(cameraAngle);
        const sin = Math.sin(cameraAngle);
        const worldX = joystickDir.x * cos - joystickDir.z * sin;
        const worldZ = joystickDir.x * sin + joystickDir.z * cos;

        playerRoot.position.x += worldX * speed;
        playerRoot.position.z += worldZ * speed;

        playerRoot.position.x = Math.max(-9.5, Math.min(9.5, playerRoot.position.x));
        playerRoot.position.z = Math.max(-9.5, Math.min(9.5, playerRoot.position.z));

        // Rotate player to face movement direction
        const angle = Math.atan2(worldX, worldZ);
        playerRoot.rotation.y = angle;

        // Choose animation: turn left/right when mostly lateral, walk otherwise
        if (isTurning && joystickDir.x < 0) {
          playAnim(turnLeftAnim);
        } else if (isTurning && joystickDir.x > 0) {
          playAnim(turnRightAnim);
        } else {
          playAnim(walkAnim);
        }
      } else {
        playAnim(idleAnim);
      }

      // Camera targets player torso height
      camera.target.set(playerRoot.position.x, playerRoot.position.y + 1, playerRoot.position.z);
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
