const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔐 Setting up HTTPS for Tatmeen Mobile App...\n');

// Create ssl directory
const sslDir = path.join(__dirname, 'ssl');
if (!fs.existsSync(sslDir)) {
  fs.mkdirSync(sslDir);
  console.log('✅ Created ssl directory');
}

// Check if certificates already exist
const certPath = path.join(sslDir, 'server.crt');
const keyPath = path.join(sslDir, 'server.key');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log('✅ SSL certificates already exist');
  console.log('📁 Certificate:', certPath);
  console.log('🔑 Private Key:', keyPath);
} else {
  try {
    console.log('🔨 Generating SSL certificates...');
    
    // Generate private key
    execSync('openssl genrsa -out ssl/server.key 2048', { stdio: 'inherit' });
    console.log('✅ Generated private key');
    
    // Generate certificate signing request
    execSync('openssl req -new -key ssl/server.key -out ssl/server.csr -subj "/C=US/ST=State/L=City/O=Tatmeen/CN=localhost"', { stdio: 'inherit' });
    console.log('✅ Generated certificate signing request');
    
    // Generate self-signed certificate
    execSync('openssl x509 -req -days 365 -in ssl/server.csr -signkey ssl/server.key -out ssl/server.crt', { stdio: 'inherit' });
    console.log('✅ Generated self-signed certificate');
    
    // Clean up CSR file
    fs.unlinkSync(path.join(sslDir, 'server.csr'));
    console.log('✅ Cleaned up temporary files');
    
  } catch (error) {
    console.error('❌ Error generating SSL certificates:', error.message);
    console.log('\n💡 Make sure OpenSSL is installed on your system:');
    console.log('   - macOS: brew install openssl');
    console.log('   - Ubuntu/Debian: sudo apt-get install openssl');
    console.log('   - CentOS/RHEL: sudo yum install openssl');
    process.exit(1);
  }
}

console.log('\n🚀 SSL setup complete!');
console.log('\n📋 Available commands:');
console.log('   npm run start:https    - Start with HTTPS on network');
console.log('   npm run start:network  - Start with HTTP on network');
console.log('   npm start              - Start locally only');
console.log('\n🌐 Network access:');
console.log('   HTTPS: https://[your-ip]:8100');
console.log('   HTTP:  http://[your-ip]:8100');
console.log('\n⚠️  Note: You may need to accept the self-signed certificate in your browser');
console.log('   Click "Advanced" → "Proceed to localhost (unsafe)"');
