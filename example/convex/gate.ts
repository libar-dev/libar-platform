// The maintenance gate's four operator entries, registered by the gate library and re-exported here,
// so they are reached as internal.gate.closeGate, internal.gate.resumeGate, internal.gate.getGate and
// internal.gate.getGateAudit, with admin access only.
export {
  closeGate,
  getGate,
  getGateAudit,
  resumeGate,
} from "../../src/gate/index.js";
