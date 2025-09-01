// Test script to verify extraction functionality
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testExtraction() {
  console.log('🧪 Testing extraction functionality...');
  
  const testFile = path.join(__dirname, 'public', 'Mail - EUGENE OWUSU AFRAM JNR - Outlook.pdf');
  
  if (!fs.existsSync(testFile)) {
    console.error('❌ Test file not found:', testFile);
    return;
  }
  
  try {
    // Test extraction endpoint
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFile));
    
    console.log('📡 Calling extract API...');
    const response = await fetch('http://localhost:3001/api/ingest/extract', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Extract API failed:', errorData);
      return;
    }
    
    const result = await response.json();
    console.log('✅ Extract API successful:', {
      success: result.success,
      textLength: result.data?.text?.length || 0,
      htmlLength: result.data?.html?.length || 0,
      metadata: result.metadata
    });
    
    // Test parsing
    if (result.data?.text) {
      console.log('📡 Testing parse API...');
      const parseResponse = await fetch('http://localhost:3001/api/ingest/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: result.data.text,
          html: result.data.html,
        }),
      });
      
      if (!parseResponse.ok) {
        const errorData = await parseResponse.json();
        console.error('❌ Parse API failed:', errorData);
        return;
      }
      
      const parseResult = await parseResponse.json();
      console.log('✅ Parse API successful:', {
        carrier: parseResult.data?.carrier,
        passengers: parseResult.data?.passengers?.length || 0,
        segments: parseResult.data?.segments?.length || 0,
        bookingRef: parseResult.data?.airlineLocator
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testExtraction();
}

module.exports = testExtraction;