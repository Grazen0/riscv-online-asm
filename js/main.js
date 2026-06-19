function withModuleDefaults(env) {
  return {
    locateFile: (path) => `js/${path}`,
    ...env,
  };
}

async function callAS(env) {
  const factory = window["riscv32-unknown-none-elf-as"];
  return factory(withModuleDefaults(env));
}

async function callObjdump(env) {
  const factory = window["riscv32-unknown-none-elf-objdump"];
  return factory(withModuleDefaults(env));
}

async function callObjcopy(env) {
  const factory = window["riscv32-unknown-none-elf-objcopy"];
  return factory(withModuleDefaults(env));
}

async function callLd(env) {
  const factory = window["riscv32-unknown-none-elf-ld"];
  return factory(withModuleDefaults(env));
}

function getAssemblerSettings() {
  const customFlags =
    document.getElementById("archCustomFlags")?.value?.trim() || "";

  return {
    customFlags,
  };
}

function getAssemblerArgs(sourceFile, outputFile, settings) {
  const args = [`-march=rv32ic`, `-mabi=ilp32`, `--gdwarf2`];
  if (settings.customFlags) {
    args.push(...settings.customFlags.split(/\s+/).filter(Boolean));
  }
  args.push(sourceFile, "-o", outputFile);
  return args;
}

function getToolArgs(tool, args) {
  return `${tool} ${args.join(" ")}`;
}

async function assemble(code, settings) {
  console.log(`Assembling:\n${code}`);
  const env = { noInitialRun: true };
  let out = "";
  env.print = (data) => {
    out += data + "\n";
  };
  env.printErr = (data) => {
    out += data + "\n";
  };

  const m = await callAS(env);
  m.FS.writeFile("file.s", code);

  try {
    m.callMain(getAssemblerArgs("file.s", "file.o", settings));
  } catch (e) {
    throw out || e;
  }

  console.log(`Assembled:\n${out}`);

  try {
    return m.FS.readFile("file.o");
  } catch (e) {
    throw out || e;
  }
}

async function link(object, ldscript) {
  console.log(
    `Linking:\n${bufferToHex(object).replace("\n", "")} with ${ldscript}`,
  );
  const env = { noInitialRun: true };
  let out = "";
  env.print = (data) => {
    out += data + "\n";
  };
  env.printErr = (data) => {
    out += data + "\n";
  };

  const m = await callLd(env);
  m.FS.writeFile("file.ld", ldscript);
  m.FS.writeFile("data.o", object);

  try {
    m.callMain(["-T", "file.ld", "data.o", "-o", "file.elf"]);
  } catch (e) {
    throw `LD: ${out}`;
  }

  try {
    return m.FS.readFile("file.elf");
  } catch (e) {
    throw `LD: ${out}`;
  }
}

async function dump(elf) {
  const env = { noInitialRun: true };
  let stdout = "";
  env.print = (data) => {
    stdout += data + "\n";
  };

  const m = await callObjdump(env);
  m.FS.writeFile("file.elf", elf);

  try {
    m.callMain(["-d", "file.elf", ""]);
  } catch (e) {
    return stdout;
  }

  return stdout;
}

async function getBinary(elf) {
  const env = { noInitialRun: true };
  let stdout = "";
  env.print = (data) => {
    stdout += data + "\n";
  };

  const m = await callObjcopy(env);
  m.FS.writeFile("file.elf", elf);

  try {
    m.callMain(["-O", "binary", "file.elf", "file.bin"]);
  } catch (e) {}

  return m.FS.readFile("file.bin");
}

function triggerBuild() {
  const code = window.editor.getValue();
  const ld = `
ENTRY(_start)

MEMORY {
  DATA (rwx) : ORIGIN = 0x00000000, LENGTH = 4096M
}

SECTIONS {
  .text : {
    *(.text*)
    *(.rodata*)
    . = ALIGN(4);
  } > DATA

  .data : {
    . = ALIGN(4);
    *(.data*)
    . = ALIGN(4);
  } > DATA
}
  `;

  if (!code.trim()) {
    document.getElementById("output").innerHTML =
      '<span style="color: red">Assembly code is empty</span>';
    return;
  }

  buildStuff(code, ld, getAssemblerSettings());
}

function selectBinaryBox() {
  if (document.selection) {
    var range = document.body.createTextRange();
    range.moveToElementText(document.getElementById("binaryBox"));
    range.select();
  } else if (window.getSelection) {
    var range = document.createRange();
    range.selectNode(document.getElementById("binaryBox"));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }
}

function bufferToHex(buff) {
  const dataview = new DataView(buff.buffer);
  let hexString = "";
  const hexOcts = (buff.byteLength / 4) >>> 0;
  for (let i = 0; i < hexOcts; i++) {
    const v = dataview.getInt32(i * 4, true) >>> 0;
    hexString += v.toString(16).padStart(8, "0") + "\n";
  }
  return hexString;
}

function _arrayBufferToBase64(buffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

async function copyResult(id, button) {
  const el = document.getElementById(id);
  if (!el) {
    return;
  }

  const text = el.textContent || "";

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("copy");
      selection.removeAllRanges();
    }

    if (button) {
      const original = button.dataset.label || button.textContent;
      button.dataset.label = original;
      button.textContent = "Copiado";
      button.classList.add("is-copied");
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("is-copied");
      }, 1400);
    }
  } catch (err) {
    console.error("Copy failed", err);
  }
}

async function doAssemble(code, ldscript, settings) {
  const output = document.getElementById("output");

  const asArgs = getAssemblerArgs("file.s", "file.o", settings);
  output.textContent += `$ ${getToolArgs("riscv32-unknown-none-elf-as", asArgs)}\n`;
  const object = await assemble(code, settings);

  const ldArgs = ["-T", "file.ld", "data.o", "-o", "file.elf"];
  output.textContent += `$ ${getToolArgs("riscv32-unknown-none-elf-ld", ldArgs)}\n`;
  const elf = await link(object, ldscript);

  output.textContent += `$ riscv32-unknown-none-elf-objdump -d file.elf\n`;
  const data = await dump(elf);

  output.textContent += `$ riscv32-unknown-none-elf-objcopy -O binary file.elf file.bin\n`;
  const bin = await getBinary(elf);

  return {
    elf,
    data,
    bin: _arrayBufferToBase64(bin),
    hex: bufferToHex(bin),
  };
}

async function buildStuff(code, ldscript, settings = getAssemblerSettings()) {
  const output = document.getElementById("output");
  const binaryBox = document.getElementById("binaryBox");
  const objDumpBox = document.getElementById("objDumpBox");
  try {
    output.textContent = "";
    binaryBox.textContent = "";
    objDumpBox.textContent = "";
    document.getElementById("building").style.display = "";
    const l = await doAssemble(code, ldscript, settings);
    binaryBox.innerHTML = l.hex;
    objDumpBox.innerHTML = l.data;
    output.innerHTML += '<span style="color: #22c55e">OK!</span>';
    document.querySelector(".copy-btn").disabled = false;
  } catch (e) {
    output.innerHTML += `<span style="color: #ef4444">${e}</span>`;
  }
  document.getElementById("building").style.display = "none";
}

window.doAssemble = doAssemble;
window.buildStuff = buildStuff;
window.copyResult = copyResult;
window.triggerBuild = triggerBuild;

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    triggerBuild();
  }
});
