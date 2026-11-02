// Stub du paquet « server-only » (existe seulement dans le bundle Next.js).
const Module = require("module");
const original = Module._load;
Module._load = function (request, ...args) {
  if (request === "server-only") return {};
  return original.apply(this, [request, ...args]);
};
