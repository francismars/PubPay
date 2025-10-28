import React from 'react';
import { Link } from 'react-router-dom';

const AboutPage: React.FC = () => {
  return (
    <div className="profilePage">
      <h1 className="profilePageTitle">
        About
      </h1>
      
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '36px', fontWeight: '700', marginBottom: '10px', color: '#4a75ff' }}>
          Request Payments, Get Paid Instantly
        </h2>
      <p style={{ fontSize: '20px', color: '#666', marginBottom: '40px', lineHeight: '1.5' }}>
        PubPay lets you create payment requests that anyone can pay with just a few clicks. Whether you're collecting donations, splitting bills, or selling services — get paid instantly with Bitcoin via the Lightning Network.
      </p>

      <div style={{ fontSize: '16px', lineHeight: '1.8', color: '#333' }}>
        <section style={{ marginBottom: '50px' }}>
          <h2 style={{ fontSize: '26px', fontWeight: '600', marginBottom: '20px', color: '#333', borderBottom: '2px solid #4a75ff', paddingBottom: '10px' }}>
            Why Use PubPay?
          </h2>
          <p style={{ marginBottom: '15px' }}>
            <strong>No sign-ups required for payers.</strong> Share your payment link and anyone can pay you instantly using their Bitcoin Lightning wallet. No complex forms, no waiting—just fast, direct payments.
          </p>
          <p style={{ marginBottom: '15px' }}>
            All your payment requests are <strong>public, transparent, and verifiable</strong>. Everyone can see what you're requesting, how much you've received, and who's paid—building trust and credibility in your transactions.
          </p>
        </section>

        <section style={{ marginBottom: '50px' }}>
          <h2 style={{ fontSize: '26px', fontWeight: '600', marginBottom: '20px', color: '#333', borderBottom: '2px solid #4a75ff', paddingBottom: '10px' }}>
            What You Can Do
          </h2>
          
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '10px', color: '#4a75ff' }}>
              Create Payment Requests in Seconds
            </h3>
            <p style={{ marginBottom: '10px' }}>
              Write a description, set an amount (or let people choose), and publish. Your payment request is immediately shareable and ready to receive payments.
            </p>
          </div>

          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '10px', color: '#4a75ff' }}>
              Lightning-Fast Payments
            </h3>
            <p style={{ marginBottom: '10px' }}>
              Receive payments instantly using Bitcoin's Lightning Network. No waiting, no delays—money arrives in seconds with minimal fees.
            </p>
          </div>

          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '10px', color: '#4a75ff' }}>
              Flexible Options
            </h3>
            <ul style={{ paddingLeft: '25px', marginBottom: '10px' }}>
              <li style={{ marginBottom: '8px' }}><strong>Fixed amounts:</strong> Request a specific payment amount</li>
              <li style={{ marginBottom: '8px' }}><strong>Flexible amounts:</strong> Let people pay what they want within a range</li>
              <li style={{ marginBottom: '8px' }}><strong>Limit responses:</strong> Cap how many people can pay (perfect for limited stock or events)</li>
              <li style={{ marginBottom: '8px' }}><strong>Control payers:</strong> Restrict payments to specific people</li>
            </ul>
          </div>

          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '10px', color: '#4a75ff' }}>
              Works Everywhere
            </h3>
            <p style={{ marginBottom: '10px' }}>
              Built on open standards, PubPay works with any Bitcoin Lightning wallet. Share your requests anywhere—social media, messaging apps, or email.
            </p>
          </div>

          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '10px', color: '#4a75ff' }}>
              See Who Paid
            </h3>
            <p style={{ marginBottom: '10px' }}>
              All payments are visible on your request, so you know who paid, when, and how much. Perfect for tracking donations, splitting bills, or managing group payments.
            </p>
          </div>
        </section>

        <section style={{ marginBottom: '50px' }}>
          <h2 style={{ fontSize: '26px', fontWeight: '600', marginBottom: '20px', color: '#333', borderBottom: '2px solid #4a75ff', paddingBottom: '10px' }}>
            Use Cases
          </h2>
          
          <div style={{ display: 'grid', gap: '20px', marginBottom: '30px' }}>
            <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #e9ecef' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#4a75ff' }}>💝 Donations</h3>
              <p style={{ margin: '0', color: '#555' }}>Create public donation requests with fixed or range payment amounts, allowing supporters to contribute easily.</p>
            </div>

            <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #e9ecef' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#4a75ff' }}>🛒 Service Payments</h3>
              <p style={{ margin: '0', color: '#555' }}>Request payments for services with payer restrictions to ensure only authorized payers can complete transactions.</p>
            </div>

            <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #e9ecef' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#4a75ff' }}>🎫 Event Ticketing</h3>
              <p style={{ margin: '0', color: '#555' }}>Use usage limits (<code style={{ background: '#fff', padding: '1px 4px', borderRadius: '3px' }}>zap-uses</code>) to control the number of tickets sold.</p>
            </div>

            <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #e9ecef' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#4a75ff' }}>📊 Crowdfunding</h3>
              <p style={{ margin: '0', color: '#555' }}>Set up range payment requests to allow contributors to donate any amount within a specified range.</p>
            </div>

            <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #e9ecef' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#4a75ff' }}>🔗 Transparent Payments</h3>
              <p style={{ margin: '0', color: '#555' }}>Create publicly verifiable payment requests, ensuring transparency and trust in all transactions.</p>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: '50px' }}>
          <h2 style={{ fontSize: '26px', fontWeight: '600', marginBottom: '20px', color: '#333', borderBottom: '2px solid #4a75ff', paddingBottom: '10px' }}>
            Built for Everyone
          </h2>
          
          <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #e9ecef', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#333' }}>🔓 Decentralized & Open</h3>
            <p style={{ margin: '0', color: '#555' }}>
              Built on open, decentralized protocols. Your payment requests aren't locked to any platform—they're yours to share and use anywhere.
            </p>
          </div>

          <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #e9ecef', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#333' }}>🔒 Privacy First</h3>
            <p style={{ margin: '0', color: '#555' }}>
              No central servers tracking your data. Only you control what gets shared and who can see your payment requests.
            </p>
          </div>

          <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #e9ecef', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', color: '#333' }}>🌍 Censorship Resistant</h3>
            <p style={{ margin: '0', color: '#555' }}>
              Your payment requests can't be taken down or blocked. Once published, they exist independently on a global network.
            </p>
          </div>
        </section>

        <section style={{ marginBottom: '50px' }}>
          <h2 style={{ fontSize: '26px', fontWeight: '600', marginBottom: '20px', color: '#333', borderBottom: '2px solid #4a75ff', paddingBottom: '10px' }}>
            Getting Started
          </h2>
          
          <ol style={{ paddingLeft: '25px', lineHeight: '1.8' }}>
            <li style={{ marginBottom: '15px' }}>
              <Link to="/register" style={{ color: '#4a75ff', fontWeight: '600' }}>Sign up</Link> or sign in using one of the available methods
            </li>
            <li style={{ marginBottom: '15px' }}>
              Click <strong>"New Paynote"</strong> to create your first payment request
            </li>
            <li style={{ marginBottom: '15px' }}>
              Choose between <strong>fixed</strong> or <strong>range</strong> payment amounts
            </li>
            <li style={{ marginBottom: '15px' }}>
              Optionally add usage limits, payer restrictions, or custom Lightning addresses
            </li>
            <li style={{ marginBottom: '15px' }}>
              Share your payment request and receive Lightning payments
            </li>
          </ol>
        </section>

        <section style={{ marginBottom: '50px' }}>
          <div style={{ background: 'linear-gradient(135deg, #4a75ff 0%, #3b5bdb 100%)', padding: '30px', borderRadius: '12px', color: '#fff', textAlign: 'center' }}>
            <h3 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '10px' }}>
              Ready to Get Started?
            </h3>
            <p style={{ fontSize: '16px', marginBottom: '20px', opacity: '0.95' }}>
              Join the decentralized payment revolution. Create your first paynote today!
            </p>
            <Link 
              to="/" 
              style={{
                display: 'inline-block',
                background: '#fff',
                color: '#4a75ff',
                padding: '12px 30px',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: '600',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              Start Using PubPay
            </Link>
          </div>
        </section>

        <div style={{ borderTop: '1px solid #e9ecef', paddingTop: '20px', marginTop: '40px', fontSize: '14px', color: '#999', textAlign: 'center' }}>
          <p style={{ margin: '0' }}>
            Built with ❤️ on Nostr Protocol • Decentralized • Censorship-Resistant
          </p>
        </div>
      </div>
      </div>
    </div>
  );
};

export default AboutPage;
