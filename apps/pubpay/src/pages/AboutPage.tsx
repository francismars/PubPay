import React from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { pubpayImg } from '../assets/images';

const AboutPage: React.FC = () => {
  const navigate = useNavigate();
  const { authState } = useOutletContext<any>();

  const handleGetStarted = () => {
    if (authState?.isLoggedIn) {
      // Open the new paynote modal
      window.dispatchEvent(new CustomEvent('openNewPayNoteForm'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Navigate to register page
      navigate('/register');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
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
          Get paid instantly.
          <br />
          Anywhere, anytime.
        </h2>
        <p className="aboutHeroSubtitle">
        Whether you're collecting donations, splitting bills, or
        selling services, PubPay lets you create payment requests that can be paid with just
          a few clicks.
        </p>

        <div className="aboutContent">
          <section className="aboutSection">
            <h2 className="aboutSectionTitle">What You Can Do</h2>

            <div className="featureBlock">
              <h3 className="featureTitle">
                Create Payment Requests in Seconds
              </h3>
              <p className="featureDescription">
                Write a description, set an amount, and publish. Your payment
                request is immediately shareable and ready to receive payments.
              </p>
            </div>

            <div className="featureBlock">
              <h3 className="featureTitle">Lightning-Fast Payments</h3>
              <p className="featureDescription">
                No waiting, no delays. Money arrives in seconds with minimal fees.
              </p>
            </div>

            <div className="featureBlock">
              <h3 className="featureTitle">Flexible Options</h3>
              <ul className="featureList">
                <li className="featureListItem">
                  <strong>Fixed amounts:</strong> Request a specific payment
                  amount
                </li>
                <li className="featureListItem">
                  <strong>Flexible amounts:</strong> Let people pay what they
                  want within a range
                </li>
                <li className="featureListItem">
                  <strong>Limit responses:</strong> Cap how many people can pay
                  (perfect for limited stock or events)
                </li>
                <li className="featureListItem">
                  <strong>Control payers:</strong> Restrict payments to specific
                  people
                </li>
              </ul>
            </div>

            <div className="featureBlock">
              <h3 className="featureTitle">See Who Paid</h3>
              <p className="featureDescription">
                All payments are transparent and verifiable.
              </p>
            </div>

            <div className="featureBlockLast">
              <h3 className="featureTitle">Works Everywhere</h3>
              <p className="featureDescription">
                Built on open standards, PubPay works with any Bitcoin Lightning
                wallet.
              </p>
            </div>
          </section>

          <section className="aboutSection">
            <h2 className="aboutSectionTitleLarge">Use Cases</h2>

            <div className="useCasesGrid">
              <div className="useCaseCard">
                <h3 className="useCaseTitle">Donations</h3>
                <p className="useCaseDescription">
                  Create public donation requests. Allow supporters to contribute easily.
                </p>
              </div>

              <div className="useCaseCard">
                <h3 className="useCaseTitle">Bill Splitting</h3>
                <p className="useCaseDescription">
                 Let everyone contribute their share. 
                </p>
              </div>

              <div className="useCaseCard">
                <h3 className="useCaseTitle">Services</h3>
                <p className="useCaseDescription">
                  Request payments for services limited to authorized payers.
                </p>
              </div>

              <div className="useCaseCard">
                <h3 className="useCaseTitle">Events</h3>
                <p className="useCaseDescription">
                  Use usage limits to control the
                  number of tickets sold.
                </p>
              </div>

              <div className="useCaseCard">
                <h3 className="useCaseTitle">Crowdfunding</h3>
                <p className="useCaseDescription">
                  Contributors can donate any amount within a specified range.
                </p>
              </div>

              <div className="useCaseCard">
                <h3 className="useCaseTitle">Verifiable</h3>
                <p className="useCaseDescription">
                  Ensure transparency in all payments.
                </p>
              </div>
            </div>
          </section>

          <section className="aboutSection">
            <h2 className="aboutSectionTitleAlt">Getting Started</h2>

            <ol className="gettingStartedList">
              <li className="gettingStartedItem">
                <Link
                  to="/register"
                  className="gettingStartedLink"
                  onClick={() =>
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                >
                  Sign up
                </Link>{' '}
                or sign in using one of the available methods
              </li>
              <li className="gettingStartedItem">
                Click <strong>"New Paynote"</strong> to create your first
                payment request
              </li>
              <li className="gettingStartedItem">
                Choose between <strong>fixed</strong> or <strong>range</strong>{' '}
                payment amounts
              </li>
              <li className="gettingStartedItem">
                Optionally add usage limits, payer restrictions, or custom
                Lightning addresses
              </li>
              <li className="gettingStartedItemLast">
                Share your payment request and receive Lightning payments
              </li>
            </ol>
          </section>

          <section className="aboutSection">
            <div className="ctaSection">
              <h3 className="ctaTitle">Ready to Get Started?</h3>
              <p className="ctaSubtitle">
                Create your first paynote today.
              </p>
              <button className="ctaButton" onClick={handleGetStarted}>
                Start Using PubPay
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
