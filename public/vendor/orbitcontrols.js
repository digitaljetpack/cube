// Local OrbitControls with fixed import path and small patches.
// - Points directly at your served three.module.js
// - Uses `let scale` (not const)
// - Resets deltas each update() so motion doesn't keep accumulating

import {
  EventDispatcher,
  MOUSE,
  REVISION,
  TOUCH,
  Quaternion,
  Spherical,
  Vector2,
  Vector3
} from "/vendor/three/build/three.module.js";

const _changeEvent = { type: "change" };
const _startEvent  = { type: "start" };
const _endEvent    = { type: "end" };

class OrbitControls extends EventDispatcher {
  constructor(object, domElement) {
    super();

    this.object = object;
    this.domElement = domElement;

    // public config
    this.enabled = true;
    this.target = new Vector3();

    this.minDistance = 0;
    this.maxDistance = Infinity;

    this.minZoom = 0;
    this.maxZoom = Infinity;

    this.minPolarAngle = 0;
    this.maxPolarAngle = Math.PI;

    this.minAzimuthAngle = -Infinity;
    this.maxAzimuthAngle =  Infinity;

    this.enableDamping = false; // supported but simplified
    this.dampingFactor = 0.05;

    this.enableZoom = true;
    this.zoomSpeed  = 1.0;

    this.enableRotate = true;
    this.rotateSpeed  = 1.0;

    this.enablePan = true;
    this.panSpeed  = 1.0;
    this.screenSpacePanning = true;
    this.keyPanSpeed = 7.0;

    this.autoRotate = false;       // not used here
    this.autoRotateSpeed = 2.0;

    this.enableKeys = true;
    this.keys = { LEFT:"ArrowLeft", UP:"ArrowUp", RIGHT:"ArrowRight", BOTTOM:"ArrowDown" };

    // default mapping (you remap in your app)
    this.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
    this.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

    // reset storage
    this.target0   = this.target.clone();
    this.position0 = this.object.position.clone();
    this.zoom0     = this.object.zoom;

    // internals
    const scope = this;

    const quat = new Quaternion().setFromUnitVectors(object.up, new Vector3(0, 1, 0));
    const quatInverse = quat.clone().invert();

    const lastPosition   = new Vector3();
    const lastQuaternion = new Quaternion();

    const EPS = 1e-6;

    const spherical       = new Spherical();
    const sphericalDelta  = new Spherical();
    let   scale           = 1;                 // <-- must be let
    const panOffset       = new Vector3();
    let   zoomChanged     = false;

    const rotateStart = new Vector2(), rotateEnd = new Vector2(), rotateDelta = new Vector2();
    const panStart    = new Vector2(), panEnd    = new Vector2(), panDelta    = new Vector2();
    const dollyStart  = new Vector2(), dollyEnd  = new Vector2(), dollyDelta  = new Vector2();

    const STATE = { NONE:-1, ROTATE:0, DOLLY:1, PAN:2 };
    let state = STATE.NONE;

    function getZoomScale() { return Math.pow(0.95, scope.zoomSpeed); }

    function rotateLeft(angle) { sphericalDelta.theta -= angle; }
    function rotateUp(angle)   { sphericalDelta.phi   -= angle; }

    const panLeft = (() => {
      const v = new Vector3();
      return (distance, objectMatrix) => {
        v.setFromMatrixColumn(objectMatrix, 0);
        v.multiplyScalar(-distance);
        panOffset.add(v);
      };
    })();

    const panUp = (() => {
      const v = new Vector3();
      return (distance, objectMatrix) => {
        if (scope.screenSpacePanning === true) {
          v.setFromMatrixColumn(objectMatrix, 1);
        } else {
          v.setFromMatrixColumn(objectMatrix, 0);
          v.crossVectors(scope.object.up, v);
        }
        v.multiplyScalar(distance);
        panOffset.add(v);
      };
    })();

    const pan = (( ) => {
      const offset = new Vector3();
      return (deltaX, deltaY) => {
        const element = scope.domElement;
        if (scope.object.isPerspectiveCamera) {
          const position = scope.object.position;
          offset.copy(position).sub(scope.target);
          let targetDistance = offset.length();
          targetDistance *= Math.tan((scope.object.fov / 2) * Math.PI / 180);
          panLeft( 2 * deltaX * targetDistance / element.clientHeight, scope.object.matrix);
          panUp  ( 2 * deltaY * targetDistance / element.clientHeight, scope.object.matrix);
        } else if (scope.object.isOrthographicCamera) {
          panLeft( deltaX * (scope.object.right - scope.object.left) / scope.object.zoom / element.clientWidth,  scope.object.matrix);
          panUp  ( deltaY * (scope.object.top - scope.object.bottom) / scope.object.zoom / element.clientHeight, scope.object.matrix);
        } else {
          scope.enablePan = false; // unknown camera
        }
      };
    })();

    function dollyIn(dollyScale) {
      if (scope.object.isPerspectiveCamera) {
        scale /= dollyScale;
      } else if (scope.object.isOrthographicCamera) {
        scope.object.zoom = Math.max(scope.minZoom, Math.min(scope.maxZoom, scope.object.zoom * dollyScale));
        scope.object.updateProjectionMatrix();
        zoomChanged = true;
      }
    }

    function dollyOut(dollyScale) {
      if (scope.object.isPerspectiveCamera) {
        scale *= dollyScale;
      } else if (scope.object.isOrthographicCamera) {
        scope.object.zoom = Math.max(scope.minZoom, Math.min(scope.maxZoom, scope.object.zoom / dollyScale));
        scope.object.updateProjectionMatrix();
        zoomChanged = true;
      }
    }

    // Mouse handlers
    function handleMouseDownRotate(event) { rotateStart.set(event.clientX, event.clientY); }
    function handleMouseDownDolly (event) { dollyStart.set (event.clientX, event.clientY); }
    function handleMouseDownPan   (event) { panStart.set   (event.clientX, event.clientY); }

    function handleMouseMoveRotate(event) {
      rotateEnd.set(event.clientX, event.clientY);
      rotateDelta.subVectors(rotateEnd, rotateStart).multiplyScalar(scope.rotateSpeed);

      const element = scope.domElement;
      rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientHeight );
      rotateUp  ( 2 * Math.PI * rotateDelta.y / element.clientHeight );

      rotateStart.copy(rotateEnd);
      scope.update();
    }

    function handleMouseMoveDolly(event) {
      dollyEnd.set(event.clientX, event.clientY);
      dollyDelta.subVectors(dollyEnd, dollyStart);
      if (dollyDelta.y > 0) dollyIn(getZoomScale());
      else if (dollyDelta.y < 0) dollyOut(getZoomScale());
      dollyStart.copy(dollyEnd);
      scope.update();
    }

    function handleMouseMovePan(event) {
      panEnd.set(event.clientX, event.clientY);
      panDelta.subVectors(panEnd, panStart).multiplyScalar(scope.panSpeed);
      pan(panDelta.x, panDelta.y);
      panStart.copy(panEnd);
      scope.update();
    }

    function onMouseDown(event) {
      if (!scope.enabled) return;

      switch (event.button) {
        case 0: // LEFT
          if (scope.mouseButtons.LEFT === MOUSE.DOLLY)      { handleMouseDownDolly(event);  state = STATE.DOLLY;  }
          else if (scope.mouseButtons.LEFT === MOUSE.ROTATE){ handleMouseDownRotate(event); state = STATE.ROTATE; }
          else if (scope.mouseButtons.LEFT === MOUSE.PAN)   { handleMouseDownPan(event);    state = STATE.PAN;    }
          break;
        case 1: // MIDDLE
          if (scope.mouseButtons.MIDDLE === MOUSE.DOLLY)    { handleMouseDownDolly(event);  state = STATE.DOLLY;  }
          else if (scope.mouseButtons.MIDDLE === MOUSE.ROTATE){ handleMouseDownRotate(event); state = STATE.ROTATE; }
          else if (scope.mouseButtons.MIDDLE === MOUSE.PAN) { handleMouseDownPan(event);    state = STATE.PAN;    }
          break;
        case 2: // RIGHT
          if (scope.mouseButtons.RIGHT === MOUSE.DOLLY)     { handleMouseDownDolly(event);  state = STATE.DOLLY;  }
          else if (scope.mouseButtons.RIGHT === MOUSE.ROTATE){ handleMouseDownRotate(event); state = STATE.ROTATE; }
          else if (scope.mouseButtons.RIGHT === MOUSE.PAN)  { handleMouseDownPan(event);    state = STATE.PAN;    }
          break;
      }

      if (state !== STATE.NONE) {
        scope.domElement.ownerDocument.addEventListener("mousemove", onMouseMove);
        scope.domElement.ownerDocument.addEventListener("mouseup", onMouseUp);
        scope.dispatchEvent(_startEvent);
      }
    }

    function onMouseMove(event) {
      if (!scope.enabled) return;
      if (state === STATE.ROTATE && scope.enableRotate)      handleMouseMoveRotate(event);
      else if (state === STATE.DOLLY && scope.enableZoom)    handleMouseMoveDolly(event);
      else if (state === STATE.PAN   && scope.enablePan)     handleMouseMovePan(event);
    }

    function onMouseUp() {
      scope.domElement.ownerDocument.removeEventListener("mousemove", onMouseMove);
      scope.domElement.ownerDocument.removeEventListener("mouseup", onMouseUp);
      scope.dispatchEvent(_endEvent);
      state = STATE.NONE;
    }

    function onMouseWheel(event) {
      if (!scope.enabled || !scope.enableZoom || state !== STATE.NONE) return;
      if (event.deltaY < 0) dollyOut(getZoomScale());
      else if (event.deltaY > 0) dollyIn(getZoomScale());
      scope.update();
    }

    // public API
    this.update = function () {
      const offset = new Vector3();

      // rotate offset to "y-up"
      offset.copy(this.object.position).sub(this.target);
      offset.applyQuaternion(quat);

      // set from offset
      spherical.setFromVector3(offset);

      // apply deltas
      spherical.theta += sphericalDelta.theta;
      spherical.phi   += sphericalDelta.phi;

      // restrict
      spherical.theta = Math.max(this.minAzimuthAngle, Math.min(this.maxAzimuthAngle, spherical.theta));
      spherical.phi   = Math.max(this.minPolarAngle,   Math.min(this.maxPolarAngle,   spherical.phi));

      spherical.makeSafe(); // keep away from poles

      // apply scale (dolly)
      spherical.radius *= scale;
      spherical.radius  = Math.max(this.minDistance, Math.min(this.maxDistance, spherical.radius));

      // pan
      this.target.add(panOffset);

      // reconvert to world space
      offset.setFromSpherical(spherical);
      offset.applyQuaternion(quatInverse);

      // set camera
      this.object.position.copy(this.target).add(offset);
      this.object.lookAt(this.target);

      // reset per-frame increments so motion doesn't accumulate
      sphericalDelta.set(0, 0, 0);
      panOffset.set(0, 0, 0);
      scale = 1;

      // change detection
      if (
        zoomChanged ||
        lastPosition.distanceToSquared(this.object.position) > EPS ||
        8 * (1 - lastQuaternion.dot(this.object.quaternion)) > EPS
      ) {
        this.dispatchEvent(_changeEvent);
        lastPosition.copy(this.object.position);
        lastQuaternion.copy(this.object.quaternion);
        zoomChanged = false;
        return true;
      }
      return false;
    };

    this.reset = function () {
      this.target.copy(this.target0);
      this.object.position.copy(this.position0);
      this.object.zoom = this.zoom0;
      this.object.updateProjectionMatrix();
      this.dispatchEvent(_changeEvent);
      this.update();
      state = STATE.NONE;
    };

    // events
    this.domElement.addEventListener("contextmenu", e => e.preventDefault(), false);
    this.domElement.addEventListener("mousedown", onMouseDown, false);
    this.domElement.addEventListener("wheel", onMouseWheel, { passive: false });
  }
}

export { OrbitControls, MOUSE, TOUCH, REVISION };
