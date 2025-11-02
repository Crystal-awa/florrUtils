// 本代码为获取Movement helper基准值
// Made by 可爱猫娘 2038794363
// 工具函数
function decodeLEB128FromArray(bytesArr) {
  let result = 0;
  let shift = 0;
  for (const byte of bytesArr) {
    result |= (byte & 0x7F) << shift;
    if ((byte & 0x80) === 0) return result;
    shift += 7;
  }
  throw new Error('Incomplete LEB128 sequence');
}

function matchPatternAndDecodeMulti(bytes, targetPattern, tasks) {
  const matchIndex = (function findMatch(data, pattern) {
    for (let i = 0; i <= data.length - pattern.length; i++) {
      let ok = true;
      for (let j = 0; j < pattern.length; j++) {
        const expected = pattern[j];
        const actual = data[i + j];
        if (expected !== '*' && actual !== expected) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  })(bytes, targetPattern);

  if (matchIndex === -1) return Object.fromEntries(tasks.map(t => [t[0], null]));

  const result = {};
  for (const task of tasks) {
    const name = task[0];
    const offsets = task.slice(1);
    const bytesToDecode = [];

    for (const off of offsets) {
      const idx = matchIndex + off;
      if (idx < 0 || idx >= bytes.length) {
        bytesToDecode.length = 0;
        break;
      }
      bytesToDecode.push(bytes[idx]);
    }

    if (bytesToDecode.length === 0) {
      result[name] = null;
      continue;
    }

    try {
      const val = decodeLEB128FromArray(bytesToDecode);
      result[name] = val;
    } catch (e) {
      console.error(`LEB128 decode error for ${name}:`, e);
      result[name] = null;
    }
  }

  return result;
}
// fetch wasm
async function fetchWasmBytes() {
  const response = await fetch(`https://static.florr.io/${window.versionHash}/client.wasm`);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}
// 开始获取
async function main() {
  const targetPattern_1 = [0x02, 0x40, 0x20, 0x00, 0x2D, 0x00, 0x3C, 0x45, 0x0D, 0x00];
  const tasks_1 = [
    ['button', 11, 12, 13, 14],
  ];
  
  const bytes = await fetchWasmBytes();
  
  try {
    const extra = matchPatternAndDecodeMulti(bytes, targetPattern_1, tasks_1);
    console.log('button:', extra.button);
    // button就是Movement helper的地址了，其他按钮地址可以用这个地址做相对偏移即可得到
    return extra;
  } catch (e) {
    console.error('Error extracting extra values:', e);
    return null;
  }
}

// 执行一次
main();