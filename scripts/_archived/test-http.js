const http = require('http');

const url = 'http://10.0.0.18:23000/api/sessions';

console.log(`Testing http.get to ${url}`);
console.log(`Process PID: ${process.pid}`);
console.log(`Process USER: ${process.env.USER}`);
console.log(`Process CWD: ${process.cwd()}`);

http.get(url, { timeout: 5000 }, (res) => {
  console.log(`✅ SUCCESS - Status: ${res.statusCode}`);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log(`✅ Got ${json.sessions?.length || 0} sessions`);
    } catch (e) {
      console.log(`❌ JSON parse error: ${e.message}`);
    }
  });
}).on('error', (error) => {
  console.error(`❌ FAILED - ${error.code}: ${error.message}`);
  console.error('Full error:', error);
}).on('timeout', () => {
  console.error('❌ TIMEOUT');
});
