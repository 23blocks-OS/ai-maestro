const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const builtinCapabilities = Object.freeze({
  "device.health": { activation: "any", args: object({}) },
  "camera.snapshot": { activation: "active", args: object({}) },
  "display.text": {
    activation: "active",
    args: object({ text: { type: "string", maxLength: 4096 } }),
  },
  "display.image": {
    activation: "active",
    args: object({
      mime: {
        type: "string",
        enum: ["image/jpeg", "image/png"],
        maxLength: 16,
      },
      data: { type: "string", maxLength: 349528 },
    }),
  },
  "speaker.say": {
    activation: "active",
    args: object({ text: { type: "string", maxLength: 500 } }),
  },
  "speaker.play": {
    activation: "active",
    args: object({
      mime: { type: "string", enum: ["audio/wav"], maxLength: 16 },
      data: { type: "string", maxLength: 524288 },
    }),
  },
});
export function validateSchema(schema) {
  if (
    !schema ||
    schema.type !== "object" ||
    schema.additionalProperties !== false ||
    !schema.properties ||
    Array.isArray(schema.properties) ||
    Object.keys(schema.properties).length > 16 ||
    !Array.isArray(schema.required) ||
    schema.required.some((k) => !Object.hasOwn(schema.properties, k))
  )
    throw new Error("Invalid argument schema");
  if (
    Object.keys(schema).some(
      (k) =>
        !["type", "properties", "required", "additionalProperties"].includes(k),
    )
  )
    throw new Error("Unsupported schema field");
  for (const [key, p] of Object.entries(schema.properties)) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key) ||
      !p ||
      Object.keys(p).some(
        (k) => !["type", "maxLength", "enum", "minimum", "maximum"].includes(k),
      )
    )
      throw new Error("Invalid argument definition");
    if (!["string", "boolean", "integer", "number"].includes(p.type))
      throw new Error("Unsupported argument type");
    const allowed =
      p.type === "string"
        ? ["type", "maxLength", "enum"]
        : p.type === "boolean"
          ? ["type"]
          : ["type", "minimum", "maximum"];
    if (Object.keys(p).some((k) => !allowed.includes(k)))
      throw new Error("Invalid argument attributes");
    if (
      p.type === "string" &&
      (!Number.isInteger(p.maxLength) || p.maxLength < 1 || p.maxLength > 4096)
    )
      throw new Error("String bound required");
    if (
      ["number", "integer"].includes(p.type) &&
      (!Number.isFinite(p.minimum) ||
        !Number.isFinite(p.maximum) ||
        p.minimum > p.maximum)
    )
      throw new Error("Numeric bounds required");
    if (
      p.enum &&
      (!Array.isArray(p.enum) ||
        !p.enum.length ||
        p.enum.length > 32 ||
        p.enum.some(
          (v) => typeof v !== "string" || Buffer.byteLength(v) > p.maxLength,
        ))
    )
      throw new Error("Invalid enum");
  }
}
export function validateArguments(schema, args = {}) {
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    Object.keys(args).some((k) => !Object.hasOwn(schema.properties, k)) ||
    schema.required.some((k) => !Object.hasOwn(args, k))
  )
    throw new Error("Invalid capability arguments");
  for (const [name, value] of Object.entries(args)) {
    const p = schema.properties[name];
    if (
      p.type === "string" &&
      (typeof value !== "string" ||
        Buffer.byteLength(value) > p.maxLength ||
        (p.enum && !p.enum.includes(value)))
    )
      throw new Error("Invalid string argument");
    if (p.type === "boolean" && typeof value !== "boolean")
      throw new Error("Invalid boolean argument");
    if (
      ["number", "integer"].includes(p.type) &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        (p.type === "integer" && !Number.isInteger(value)) ||
        value < p.minimum ||
        value > p.maximum)
    )
      throw new Error("Invalid numeric argument");
  }
  return args;
}
export function audioBytes(args) {
  const bytes = Buffer.from(args.data, "base64");
  if (
    bytes.length < 44 ||
    bytes.length > 393216 ||
    bytes.toString("base64") !== args.data ||
    bytes.toString("latin1", 0, 4) !== "RIFF" ||
    bytes.toString("latin1", 8, 12) !== "WAVE"
  )
    throw new Error("Invalid audio size or encoding");
  return bytes;
}
/** A person's held-to-talk recording, device to controller: 20 s of 16 kHz mono. */
export function voiceBytes(data) {
  const bytes = Buffer.from(String(data), "base64");
  if (
    bytes.length < 44 ||
    bytes.length > 655360 ||
    bytes.toString("base64") !== data ||
    bytes.toString("latin1", 0, 4) !== "RIFF" ||
    bytes.toString("latin1", 8, 12) !== "WAVE"
  )
    throw new Error("Invalid audio size or encoding");
  return bytes;
}
export function imageBytes(args) {
  const bytes = Buffer.from(args.data, "base64");
  if (
    !bytes.length ||
    bytes.length > 262144 ||
    bytes.toString("base64") !== args.data
  )
    throw new Error("Invalid image size or encoding");
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217;
  if (
    (args.mime === "image/png" && !png) ||
    (args.mime === "image/jpeg" && !jpeg)
  )
    throw new Error("Invalid image format");
  return bytes;
}
