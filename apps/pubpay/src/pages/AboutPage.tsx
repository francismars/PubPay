import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const AboutPage: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  return (
    <div className="profilePage">
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h2 style={{ fontSize: isMobile ? '32px' : '48px', fontWeight: '700', marginBottom: '20px', color: '#4a75ff', letterSpacing: '-1px', lineHeight: '1.2' }}>
          Request Payments,
          <br />
          Get Paid Instantly
        </h2>
        <p style={{ fontSize: isMobile ? '16px' : '18px', color: '#555', marginBottom: '60px', lineHeight: '1.7', maxWidth: '720px' }}>
          PubPay lets you create payment requests that anyone can pay with just a few clicks. Whether you're collecting donations, splitting bills, or selling services — get paid instantly with Bitcoin via the Lightning Network.
        </p>

      <div style={{ fontSize: '16px', lineHeight: '1.8', color: '#333' }}>
        <section style={{ marginBottom: '60px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '24px', color: '#2c3e50', letterSpacing: '-0.3px' }}>
            Why Use PubPay?
          </h2>
          <p style={{ marginBottom: '15px' }}>
            <strong>No sign-ups required for payers.</strong> Share your payment link and anyone can pay you instantly using their Bitcoin Lightning wallet. No complex forms, no waiting—just fast, direct payments.
          </p>
          <p style={{ marginBottom: '15px' }}>
            All your payment requests are <strong>public, transparent, and verifiable</strong>. Everyone can see what you're requesting, how much you've received, and who's paid—building trust and credibility in your transactions.
          </p>
        </section>

        <section style={{ marginBottom: '60px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '24px', color: '#2c3e50', letterSpacing: '-0.3px' }}>
            What You Can Do
          </h2>
          
          <div style={{ marginBottom: '32px', paddingBottom: '32px', borderBottom: '1px solid #e9ecef' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#4a75ff', letterSpacing: '-0.2px' }}>
              Create Payment Requests in Seconds
            </h3>
            <p style={{ marginBottom: '0', color: '#555', lineHeight: '1.7' }}>
              Write a description, set an amount (or let people choose), and publish. Your payment request is immediately shareable and ready to receive payments.
            </p>
          </div>

          <div style={{ marginBottom: '32px', paddingBottom: '32px', borderBottom: '1px solid #e9ecef' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#4a75ff', letterSpacing: '-0.2px' }}>
              Lightning-Fast Payments
            </h3>
            <p style={{ marginBottom: '0', color: '#555', lineHeight: '1.7' }}>
              Receive payments instantly using Bitcoin's Lightning Network. No waiting, no delays—money arrives in seconds with minimal fees.
            </p>
          </div>

          <div style={{ marginBottom: '32px', paddingBottom: '32px', borderBottom: '1px solid #e9ecef' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#4a75ff', letterSpacing: '-0.2px' }}>
              Flexible Options
            </h3>
            <ul style={{ paddingLeft: '24px', marginBottom: '0', color: '#555', lineHeight: '1.8' }}>
              <li style={{ marginBottom: '8px' }}><strong>Fixed amounts:</strong> Request a specific payment amount</li>
              <li style={{ marginBottom: '8px' }}><strong>Flexible amounts:</strong> Let people pay what they want within a range</li>
              <li style={{ marginBottom: '8px' }}><strong>Limit responses:</strong> Cap how many people can pay (perfect for limited stock or events)</li>
              <li style={{ marginBottom: '8px' }}><strong>Control payers:</strong> Restrict payments to specific people</li>
            </ul>
          </div>

          <div style={{ marginBottom: '32px', paddingBottom: '32px', borderBottom: '1px solid #e9ecef' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#4a75ff', letterSpacing: '-0.2px' }}>
              Works Everywhere
            </h3>
            <p style={{ marginBottom: '0', color: '#555', lineHeight: '1.7' }}>
              Built on open standards, PubPay works with any Bitcoin Lightning wallet. Share your requests anywhere—social media, messaging apps, or email.
            </p>
          </div>

          <div style={{ marginBottom: '0' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#4a75ff', letterSpacing: '-0.2px' }}>
              See Who Paid
            </h3>
            <p style={{ marginBottom: '0', color: '#555', lineHeight: '1.7' }}>
              All payments are visible on your request, so you know who paid, when, and how much. Perfect for tracking donations, splitting bills, or managing group payments.
            </p>
          </div>
        </section>

        <section style={{ marginBottom: '60px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '32px', color: '#2c3e50', letterSpacing: '-0.3px' }}>
            Use Cases
          </h2>
          
          <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)' }}>
            <div style={{ background: '#fff', padding: '28px', borderRadius: '12px', border: '1px solid #e9ecef', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', transition: 'box-shadow 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(74, 117, 255, 0.08)'} onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04)'}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#4a75ff', letterSpacing: '-0.2px' }}>Donations</h3>
              <p style={{ margin: '0', color: '#555', lineHeight: '1.6', fontSize: '15px' }}>Create public donation requests with fixed or range payment amounts, allowing supporters to contribute easily.</p>
            </div>

            <div style={{ background: '#fff', padding: '28px', borderRadius: '12px', border: '1px solid #e9ecef', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', transition: 'box-shadow 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(74, 117, 255, 0.08)'} onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04)'}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#4a75ff', letterSpacing: '-0.2px' }}>Service Payments</h3>
              <p style={{ margin: '0', color: '#555', lineHeight: '1.6', fontSize: '15px' }}>Request payments for services with payer restrictions to ensure only authorized payers can complete transactions.</p>
            </div>

            <div style={{ background: '#fff', padding: '28px', borderRadius: '12px', border: '1px solid #e9ecef', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', transition: 'box-shadow 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(74, 117, 255, 0.08)'} onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04)'}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#4a75ff', letterSpacing: '-0.2px' }}>Event Ticketing</h3>
              <p style={{ margin: '0', color: '#555', lineHeight: '1.6', fontSize: '15px' }}>Use usage limits (<code style={{ background: '#f8f9fa', padding: '2px 6px', borderRadius: '4px', fontSize: '13px' }}>zap-uses</code>) to control the number of tickets sold.</p>
            </div>

            <div style={{ background: '#fff', padding: '28px', borderRadius: '12px', border: '1px solid #e9ecef', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', transition: 'box-shadow 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(74, 117, 255, 0.08)'} onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04)'}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#4a75ff', letterSpacing: '-0.2px' }}>Crowdfunding</h3>
              <p style={{ margin: '0', color: '#555', lineHeight: '1.6', fontSize: '15px' }}>Set up range payment requests to allow contributors to donate any amount within a specified range.</p>
            </div>

            <div style={{ background: '#fff', padding: '28px', borderRadius: '12px', border: '1px solid #e9ecef', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', transition: 'box-shadow 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(74, 117, 255, 0.08)'} onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04)'}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#4a75ff', letterSpacing: '-0.2px' }}>Transparent Payments</h3>
              <p style={{ margin: '0', color: '#555', lineHeight: '1.6', fontSize: '15px' }}>Create publicly verifiable payment requests, ensuring transparency and trust in all transactions.</p>
            </div>

            <div style={{ background: '#fff', padding: '28px', borderRadius: '12px', border: '1px solid #e9ecef', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', transition: 'box-shadow 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(74, 117, 255, 0.08)'} onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04)'}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#4a75ff', letterSpacing: '-0.2px' }}>Bill Splitting</h3>
              <p style={{ margin: '0', color: '#555', lineHeight: '1.6', fontSize: '15px' }}>Easily split bills among friends and family. Share one payment link and let everyone contribute their share.</p>
            </div>
          </div>
        </section>

       <section style={{ marginBottom: '60px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '28px', color: '#2c3e50', letterSpacing: '-0.3px' }}>
            Getting Started
          </h2>
          
          <ol style={{ paddingLeft: '28px', lineHeight: '1.9', color: '#555' }}>
            <li style={{ marginBottom: '16px' }}>
              <Link to="/register" style={{ color: '#4a75ff', fontWeight: '600', textDecoration: 'none' }}>Sign up</Link> or sign in using one of the available methods
            </li>
            <li style={{ marginBottom: '16px' }}>
              Click <strong>"New Paynote"</strong> to create your first payment request
            </li>
            <li style={{ marginBottom: '16px' }}>
              Choose between <strong>fixed</strong> or <strong>range</strong> payment amounts
            </li>
            <li style={{ marginBottom: '16px' }}>
              Optionally add usage limits, payer restrictions, or custom Lightning addresses
            </li>
            <li style={{ marginBottom: '0' }}>
              Share your payment request and receive Lightning payments
            </li>
          </ol>
        </section>

        <section style={{ marginBottom: '60px' }}>
          <div style={{ background: 'linear-gradient(135deg, #4a75ff 0%, #3b5bdb 100%)', padding: '48px 32px', borderRadius: '16px', color: '#fff', textAlign: 'center', boxShadow: '0 8px 24px rgba(74, 117, 255, 0.25)' }}>
            <h3 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '12px', letterSpacing: '-0.3px' }}>
              Ready to Get Started?
            </h3>
            <p style={{ fontSize: '17px', marginBottom: '32px', opacity: '0.95', lineHeight: '1.6' }}>
              Join the decentralized payment revolution. Create your first paynote today.
            </p>
            <Link 
              to="/" 
              style={{
                display: 'inline-block',
                background: '#fff',
                color: '#4a75ff',
                padding: '14px 36px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: '600',
                fontSize: '16px',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
              }}
            >
              Start Using PubPay
            </Link>
          </div>
        </section>

        <div style={{ borderTop: '1px solid #e9ecef', paddingTop: '28px', marginTop: '60px', fontSize: '14px', color: '#888', textAlign: 'center' }}>
          <p style={{ margin: '0', lineHeight: '1.6' }}>
            Built on Nostr Protocol • Decentralized • Censorship-Resistant
          </p>
        </div>
      </div>
      </div>
    </div>
  );
};

export default AboutPage;
