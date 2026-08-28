// Controller for Legal Documents & App Metadata

// Get Terms & Conditions
exports.getTermsAndConditions = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: "Terms and conditions retrieved successfully",
      data: {
        title: "Terms and Conditions",
        effectiveDate: "2026-08-28",
        version: "1.0",
        content: {
          introduction: "Welcome to Travel Diary (Vagabond). By creating an account or using our application, you agree to comply with and be bound by the following Terms and Conditions.",
          userAccounts: [
            "You must be at least 13 years old to use this service.",
            "You are responsible for maintaining the security of your account and password.",
            "Accounts registered by automated methods or bots are strictly prohibited."
          ],
          contentGuidelines: [
            "You retain ownership of the photos, videos, and content you post on Travel Diary.",
            "You grant Travel Diary a non-exclusive license to host, display, and distribute your content within the platform.",
            "You agree not to upload content that is illegal, offensive, harassing, or infringes on intellectual property rights."
          ],
          termination: "We reserve the right to suspend or terminate accounts that violate our community guidelines or engage in fraudulent activities.",
          governingLaw: "These terms shall be governed and construed in accordance with applicable copyright and digital privacy laws."
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Privacy Policy
exports.getPrivacyPolicy = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: "Privacy policy retrieved successfully",
      data: {
        title: "Privacy Policy",
        effectiveDate: "2026-08-28",
        version: "1.0",
        content: {
          informationCollected: [
            "Personal details provided during registration (Name, Email, Username).",
            "User-generated content including travel posts, stories, photos, videos, and location tags.",
            "Device metadata and FCM push notification tokens."
          ],
          howWeUseInformation: [
            "To provide, personalize, and improve Travel Diary services.",
            "To send account verification OTPs, security alerts, and push notifications.",
            "To facilitate social interactions (likes, comments, direct messages, and following)."
          ],
          thirdPartyServices: [
            "Cloudinary: For secure media hosting and image/video storage.",
            "Firebase Cloud Messaging: For real-time mobile push notifications.",
            "MongoDB Cloud Atlas: For encrypted data storage."
          ],
          dataRights: "Users have the right to update their profile information, download their data, or permanently delete their account at any time via Account Settings."
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get App Info & Support Metadata
exports.getAppInfo = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: "App info retrieved successfully",
      data: {
        appName: "Travel Diary",
        brandName: "Vagabond",
        version: "1.0.0",
        supportEmail: "samantasoumi10@gmail.com",
        website: "https://traveldiary.clipboux.online"
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
