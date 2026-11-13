const http = require('http');
http.get('http://localhost:3000/', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    const idx = data.indexOf('<div class="error"');
    if (idx >= 0) {
      const end = data.indexOf('</div>', idx);
      console.log('ERROR:', data.substring(idx, end + 6));
    } else {
      console.log('Body preview:', data.substring(0, 300));
    }
  });
}).on('error', e => console.error('Error:', e.message));
