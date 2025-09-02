#!/usr/bin/env node

// Simple test script to open PDF endpoint and check visual elements
// Usage: node test-pdf.js [itinerary-id]

const { exec } = require('child_process');
const path = require('path');

const ITINERARY_ID = process.argv[2] || 'TEST_ID';
const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
const PDF_URL = `${BASE_URL}/api/itineraries/${ITINERARY_ID}/pdf`;
const USE_REACT_PDF = process.env.FEATURE_REACT_PDF === 'true';

console.log('🔍 Testing PDF generation...');
console.log(`📋 Itinerary ID: ${ITINERARY_ID}`);
console.log(`🌐 PDF URL: ${PDF_URL}`);
console.log(`🎛️  Renderer: ${USE_REACT_PDF ? '@react-pdf (legacy)' : 'HTML→PDF (Puppeteer)'}`);
console.log();

console.log('✅ Visual checklist:');
console.log('  - Header: Navy background with gold underline');
console.log('  - Footer: Page numbers (X / Y format)');
console.log('  - Tables: Zebra striping (alternating rows)');
console.log('  - Times: Right-aligned with tabular nums');
console.log('  - Badge: +1 day badge for overnight flights');
console.log('  - Logo: SVG crisp at any zoom level');
console.log('  - Size: PDF < 400KB for ~2 pages');
console.log();

// Try to open PDF in default browser
console.log('🚀 Opening PDF in browser...');
const command = process.platform === 'win32' ? 'start' : 
               process.platform === 'darwin' ? 'open' : 'xdg-open';

exec(`${command} "${PDF_URL}"`, (error) => {
  if (error) {
    console.error('❌ Failed to open browser:', error.message);
    console.log('📋 Manual test: Open this URL in browser:');
    console.log(`   ${PDF_URL}`);
  } else {
    console.log('✅ PDF should open in your default browser');
  }
});

console.log();
console.log('🔧 To test with a real itinerary:');
console.log('   node test-pdf.js <actual-itinerary-id>');