import React from 'react';
import { Link } from 'react-router-dom';
import { pubpayImg } from '../assets/images';

const AboutPage: React.FC = () => {
  return (
    <div className="profilePage">
      <div className="aboutContainer">
        <div className="aboutHeroImage">
          <img 
            src={pubpayImg} 
            alt="Street musician playing guitar by a fountain with coins"
          />
        </div>
        <h2 className="aboutHeroTitle">
          Request Payments,
          <br />
          Get Paid Publicly
        </h2>
        <p className="aboutHeroSubtitle">
          PubPay lets you create payment requests that anyone can pay with just a few clicks. Whether you're collecting donations, splitting bills, or selling services — get paid instantly with Bitcoin via the Lightning Network.
        </p>

      <div className="aboutContent">
        <section className="aboutSection">
          <h2 className="aboutSectionTitle">
            Why Use PubPay?
          </h2>
          <p className="aboutParagraph">
            <strong>No sign-ups required for payers.</strong> Share your payment link and anyone can pay you instantly using their Bitcoin Lightning wallet. No complex forms, no waiting—just fast, direct payments.
          </p>
          <p className="aboutParagraph">
            All your payment requests are <strong>public, transparent, and verifiable</strong>. Everyone can see what you're requesting, how much you've received, and who's paid—building trust and credibility in your transactions.
          </p>
        </section>

        <section className="aboutSection">
          <h2 className="aboutSectionTitle">
            What You Can Do
          </h2>
          
          <div className="featureBlock">
            <h3 className="featureTitle">
              Create Payment Requests in Seconds
            </h3>
            <p className="featureDescription">
              Write a description, set an amount (or let people choose), and publish. Your payment request is immediately shareable and ready to receive payments.
            </p>
          </div>

          <div className="featureBlock">
            <h3 className="featureTitle">
              Lightning-Fast Payments
            </h3>
            <p className="featureDescription">
              Receive payments instantly using Bitcoin's Lightning Network. No waiting, no delays—money arrives in seconds with minimal fees.
            </p>
          </div>

          <div className="featureBlock">
            <h3 className="featureTitle">
              Flexible Options
            </h3>
            <ul className="featureList">
              <li className="featureListItem"><strong>Fixed amounts:</strong> Request a specific payment amount</li>
              <li className="featureListItem"><strong>Flexible amounts:</strong> Let people pay what they want within a range</li>
              <li className="featureListItem"><strong>Limit responses:</strong> Cap how many people can pay (perfect for limited stock or events)</li>
              <li className="featureListItem"><strong>Control payers:</strong> Restrict payments to specific people</li>
            </ul>
          </div>

          <div className="featureBlock">
            <h3 className="featureTitle">
              Works Everywhere
            </h3>
            <p className="featureDescription">
              Built on open standards, PubPay works with any Bitcoin Lightning wallet. Share your requests anywhere—social media, messaging apps, or email.
            </p>
          </div>

          <div className="featureBlockLast">
            <h3 className="featureTitle">
              See Who Paid
            </h3>
            <p className="featureDescription">
              All payments are visible on your request, so you know who paid, when, and how much. Perfect for tracking donations, splitting bills, or managing group payments.
            </p>
          </div>
        </section>

        <section className="aboutSection">
          <h2 className="aboutSectionTitleLarge">
            Use Cases
          </h2>
          
          <div className="useCasesGrid">
            <div className="useCaseCard">
              <h3 className="useCaseTitle">Donations</h3>
              <p className="useCaseDescription">Create public donation requests with fixed or range payment amounts, allowing supporters to contribute easily.</p>
            </div>

            <div className="useCaseCard">
              <h3 className="useCaseTitle">Service Payments</h3>
              <p className="useCaseDescription">Request payments for services with payer restrictions to ensure only authorized payers can complete transactions.</p>
            </div>

            <div className="useCaseCard">
              <h3 className="useCaseTitle">Event Ticketing</h3>
              <p className="useCaseDescription">Use usage limits (<code className="useCaseCode">zap-uses</code>) to control the number of tickets sold.</p>
            </div>

            <div className="useCaseCard">
              <h3 className="useCaseTitle">Crowdfunding</h3>
              <p className="useCaseDescription">Set up range payment requests to allow contributors to donate any amount within a specified range.</p>
            </div>

            <div className="useCaseCard">
              <h3 className="useCaseTitle">Transparent Payments</h3>
              <p className="useCaseDescription">Create publicly verifiable payment requests, ensuring transparency and trust in all transactions.</p>
            </div>

            <div className="useCaseCard">
              <h3 className="useCaseTitle">Bill Splitting</h3>
              <p className="useCaseDescription">Easily split bills among friends and family. Share one payment link and let everyone contribute their share.</p>
            </div>
          </div>
        </section>

       <section className="aboutSection">
          <h2 className="aboutSectionTitleAlt">
            Getting Started
          </h2>
          
          <ol className="gettingStartedList">
            <li className="gettingStartedItem">
              <Link 
                to="/register" 
                className="gettingStartedLink"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                Sign up
              </Link> or sign in using one of the available methods
            </li>
            <li className="gettingStartedItem">
              Click <strong>"New Paynote"</strong> to create your first payment request
            </li>
            <li className="gettingStartedItem">
              Choose between <strong>fixed</strong> or <strong>range</strong> payment amounts
            </li>
            <li className="gettingStartedItem">
              Optionally add usage limits, payer restrictions, or custom Lightning addresses
            </li>
            <li className="gettingStartedItemLast">
              Share your payment request and receive Lightning payments
            </li>
          </ol>
        </section>

        <section className="aboutSection">
          <div className="ctaSection">
            <h3 className="ctaTitle">
              Ready to Get Started?
            </h3>
            <p className="ctaSubtitle">
              Join the decentralized payment revolution. Create your first paynote today.
            </p>
            <Link 
              to="/register" 
              className="ctaButton"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Start Using PubPay
            </Link>
          </div>
        </section>

        <div className="aboutFooter">
          <p className="aboutFooterText">
            Built on Nostr Protocol • Decentralized • Censorship-Resistant
          </p>
        </div>
      </div>
      </div>
    </div>
  );
};

export default AboutPage;
