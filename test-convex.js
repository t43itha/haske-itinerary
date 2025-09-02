#!/usr/bin/env node

// Test Convex integration directly
const { ConvexHttpClient } = require('convex/browser');

// Mock the API import
const api = {
  itineraries: {
    getById: 'itineraries:getById'
  }
};

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

async function fetchItinerary(id) {
  const data = await convex.query(api.itineraries.getById, { id });
  if (!data) throw new Error("Itinerary not found");
  return data;
}

const ITINERARY_ID = process.argv[2] || 'j570kr0ffm994evts1rra8n5a57prfn1';

console.log('🔍 Testing Next.js Convex integration...');
console.log(`📋 Itinerary ID: ${ITINERARY_ID}`);
console.log();

(async () => {
  try {
    const data = await fetchItinerary(ITINERARY_ID);
    console.log('✅ fetchItinerary() returned:');
    console.log(JSON.stringify(data, null, 2));
    console.log();
    console.log(`📊 Summary:`);
    console.log(`  - ID: ${data._id}`);
    console.log(`  - Passengers: ${data.passengers?.length || 0}`);
    console.log(`  - Segments: ${data.segments?.length || 0}`);
    console.log(`  - Created: ${data.createdAt}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
})();