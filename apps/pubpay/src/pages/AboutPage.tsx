import React from 'react';

const AboutPage: React.FC = () => {
  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '20px', color: '#333' }}>
        About PubPay
      </h1>
      
      <div style={{ fontSize: '16px', lineHeight: '1.6', color: '#555' }}>
        <p style={{ marginBottom: '20px' }}>
          PubPay is a revolutionary social payment platform that combines the best of social media 
          with seamless payment functionality. Built on Nostr protocol, PubPay enables users to 
          send and receive payments while maintaining full control over their data and privacy.
        </p>
        
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '15px', marginTop: '30px', color: '#333' }}>
          Key Features
        </h2>
        
        <ul style={{ marginBottom: '20px', paddingLeft: '20px' }}>
          <li style={{ marginBottom: '10px' }}>
            <strong>Decentralized:</strong> Built on Nostr protocol for true decentralization
          </li>
          <li style={{ marginBottom: '10px' }}>
            <strong>Privacy-First:</strong> Your data stays yours, no central servers
          </li>
          <li style={{ marginBottom: '10px' }}>
            <strong>Social Payments:</strong> Send payments with social context and messages
          </li>
          <li style={{ marginBottom: '10px' }}>
            <strong>Live Performances:</strong> Support artists and creators in real-time
          </li>
          <li style={{ marginBottom: '10px' }}>
            <strong>Bill Splitting:</strong> Easily split bills and expenses with friends
          </li>
        </ul>
        
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '15px', marginTop: '30px', color: '#333' }}>
          Technology
        </h2>
        
        <p style={{ marginBottom: '20px' }}>
          PubPay leverages the power of Nostr (Notes and Other Stuff Transmitted by Relays) 
          protocol, providing a censorship-resistant and decentralized foundation for social 
          payments. This ensures that your transactions and social interactions remain 
          private and under your control.
        </p>
        
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '15px', marginTop: '30px', color: '#333' }}>
          Version Information
        </h2>
        
        <p style={{ marginBottom: '20px' }}>
          Current Version: <strong>Alpha 0.02</strong><br />
          This is an early alpha release. Features are being actively developed and improved.
        </p>
        
        <div style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px', 
          marginTop: '30px',
          border: '1px solid #e9ecef'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#333' }}>
            Get Started
          </h3>
          <p style={{ marginBottom: '0' }}>
            Ready to experience the future of social payments? Create your first paynote 
            and start connecting with the PubPay community today!
          </p>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;