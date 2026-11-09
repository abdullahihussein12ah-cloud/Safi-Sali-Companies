import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  ChartNoAxesCombined,
  CheckCircle2,
  Eye,
  EyeOff,
  FolderKanban,
  Globe,
  LockKeyhole,
  LogIn,
  LoaderCircle,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
  UserRoundCog,
  UsersRound,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Language } from '../../locales/translations';
import { AppStore } from '../../services/store';
import {
  ApiConnectionError,
  clearStoredAccessToken,
  completePasswordReset,
  createBusinessAccount,
  loginWithPassword,
  requestPasswordReset,
  resendEmailVerificationCode,
  resendPasswordResetCode,
  saveWorkspaceValue,
  verifyEmailAddress,
  verifyPasswordResetCode,
} from '../../services/api';
import { Logo } from '../brand/Logo';

let retainedLoginEmail = '';

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  const visible = name.length > 2 ? name.slice(0, 2) : name.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

const words = {
  en: {
    login: 'Company Login',
    signup: 'Company Sign Up',
    loginIntro: 'Access your company dashboard and manage your business efficiently.',
    signupIntro: 'Create your company account and start managing your business efficiently.',
    email: 'Email Address',
    password: 'Password',
    company: 'Company Name',
    fullName: 'Full Name',
    confirm: 'Confirm Password',
    phone: 'Phone Number',
    emailPlaceholder: 'Enter your company email',
    passwordPlaceholder: 'Enter your password',
    companyPlaceholder: 'Enter your company name',
    fullNamePlaceholder: 'Enter your full name',
    phonePlaceholder: 'Enter your phone number',
    confirmPlaceholder: 'Re-enter your password',
    accessAuthorization: 'I confirm that I am authorized to access this company account.',
    authorizationRequired: 'Confirm that you are authorized to access this company account before logging in.',
    forgot: 'Forgot Password?',
    loginButton: 'Sign In',
    signupButton: 'Sign Up',
    backPortal: 'Back to National Portal',
    backLogin: 'Back to Login',
    noAccount: "Don't have a company account?",
    haveAccount: 'Already have an account?',
    create: 'Create an account',
    signIn: 'Login here',
    authorized: 'Only authorized companies can access this system.',
    passwordMismatch: 'Passwords do not match.',
    passwordLength: 'Password must be at least 12 characters.',
    signupSuccess: 'Account created. Verify your email to continue.',
    emailVerificationTitle: 'Verify Your Email Address',
    emailVerificationMessage: 'We sent a 6-digit verification code to:',
    emailVerificationCode: '6-digit code',
    verifyEmail: 'Verify Email',
    resendVerificationCode: 'Resend Verification Code',
    changeEmail: 'Change Email',
    verificationCodeSent: 'A new verification code was sent.',
    verificationCodeFailed: 'We could not send the verification code. Check the email service and try again.',
    verificationCodeInvalid: 'The verification code is incorrect or has expired.',
    verificationExpired: 'Code expired. Request a new code to continue.',
    emailVerified: 'Email Successfully Verified!',
    verificationResendWait: 'You can request another code in',
    seconds: 'seconds',
    emailVerificationEmailUnavailable: 'Email service is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL, and SMTP_FROM_NAME to Backend/.env, then restart the API.',
    signupProfileWarning: 'Email verified and account created, but the company profile could not be saved. You can update it after signing in.',
    authFailed: 'We could not complete your request. Check your details and try again.',
    invalidCredentials: 'Email or password is incorrect.',
    duplicateAccount: 'An account with this email already exists. Try logging in instead.',
    connectionError: 'The service is temporarily unavailable. Please try again shortly.',
    forgotTitle: 'Forgot Your Password?',
    forgotText: 'Enter your registered email address. We will send you a verification code to reset your password.',
    verifyResetTitle: 'Verify Your Email',
    verifyResetText: 'Enter the 6-digit verification code sent to {email}.',
    resetInstructions: 'Choose a strong new password for your account.',
    forgotEmail: 'Company Email Address',
    forgotEmailRequired: 'Enter a valid company email address first.',
    sendVerificationEmail: 'Send Verification Email',
    resetSent: 'If an account exists for this address, a verification code has been sent. Please check your inbox.',
    resetCode: '6-digit verification code',
    verifyCode: 'Verify code',
    resetCodeSent: 'If an account exists for this address, a verification code has been sent. Please check your inbox.',
    resetCodeVerified: 'Code verified. Create a new password.',
    resetCodeInvalid: 'Enter the valid 6-digit code from your email.',
    resetDigit: 'Verification code digit {number}',
    resendResetCode: 'Resend Verification Code',
    resetExpiresIn: 'Code expires in',
    resetResendIn: 'Resend available in',
    resetExpired: 'This code has expired. Request a new verification code.',
    resetPasswordTitle: 'Create New Password',
    resetPasswordComplexity: 'Use at least 12 characters with lowercase, uppercase, a number, and a symbol.',
    resetSuccessTitle: 'Password Reset Successful!',
    resetSuccess: 'Your password has been updated successfully. You can now log in using your new password.',
    resetFailed: 'We could not send the verification email. Please try again.',
    emailServiceUnavailable: 'Email service is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL, and SMTP_FROM_NAME to Backend/.env, then restart the API.',
    resetRateLimited: 'Too many requests. Please try again later.',
    resetPassword: 'Reset Password',
    newPassword: 'New password',
    confirmNewPassword: 'Confirm new password',
    resetInvalid: 'This password reset link is invalid or has expired.',
    close: 'Close',
    manageCustomers: 'Manage Customers',
    manageEmployees: 'Manage Employees',
    manageServices: 'Manage Services',
    manageProjects: 'Manage Projects',
    reports: 'View Reports',
    tagline: 'Innovative Solutions for a Better Tomorrow',
    welcome: 'Welcome to SAFI SALI COMPANIES.',
    loginShowcaseDescription: 'Securely access your company dashboard and manage your business operations through one powerful, professional, and integrated management system.',
    managementSolutions: 'Our Management Solutions',
    grow: 'Grow Your Business with SAFI SALI COMPANIES',
    growDescription: 'Empowering large enterprises, small businesses, and entrepreneurs with innovative digital solutions. Manage your operations efficiently, improve productivity, make smarter decisions, and grow your business with confidence.',
    footer: '© {year} SAFI SALI COMPANIES. All Rights Reserved.',
    contact: 'Contact Support:',
    manageCustomersDescription: 'Organize customer information and relationships.',
    manageEmployeesDescription: 'Manage employee records, roles, and performance.',
    manageServicesDescription: 'Create, organize, and monitor company services.',
    manageProjectsDescription: 'Plan, track, and manage business projects.',
    reportsDescription: 'Access business insights, analytics, and performance reports.',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    acceptTerms: 'I agree to the Terms and Conditions.',
    passwordStrength: 'Password strength',
    strengthWeak: 'Weak',
    strengthFair: 'Fair',
    strengthGood: 'Good',
    strengthStrong: 'Strong',
    chooseLanguage: 'Choose language',
    loading: 'Please wait…',
  },
  so: {
    login: 'Gelitaanka Shirkadda',
    signup: 'Diiwaangelinta Shirkadda',
    loginIntro: 'Gal dashboard-ka shirkaddaada oo si hufan u maamul ganacsigaaga.',
    signupIntro: 'Sameyso akoonka shirkaddaada oo bilow maaraynta ganacsigaaga.',
    email: 'Iimaylka',
    password: 'Furaha Sirta',
    company: 'Magaca Shirkadda',
    fullName: 'Magaca oo Dhan',
    confirm: 'Xaqiiji Furaha Sirta',
    phone: 'Lambarka Telefoonka',
    emailPlaceholder: 'Geli iimaylka shirkaddaada',
    passwordPlaceholder: 'Geli furaha sirta',
    companyPlaceholder: 'Geli magaca shirkaddaada',
    fullNamePlaceholder: 'Geli magacaaga oo dhan',
    phonePlaceholder: 'Geli lambarka telefoonka',
    confirmPlaceholder: 'Mar kale geli furaha sirta',
    remember: 'I Xusuuso',
    accessAuthorization: 'Waxaan xaqiijinayaa inaan fasax u haysto gelitaanka akoonkan shirkadda.',
    authorizationRequired: 'Ka hor gelitaanka, xaqiiji inaad fasax u haysato akoonkan shirkadda.',
    forgot: 'Furaha ma illowday?',
    loginButton: 'Gal',
    signupButton: 'Is Diiwaangeli',
    backPortal: 'Ku Noqo Bogga Qaranka',
    backLogin: 'Ku Noqo Gelitaanka',
    noAccount: 'Shirkaddaadu akoon ma leedahay?',
    haveAccount: 'Akoon hore ma u leedahay?',
    create: 'Sameyso akoon',
    signIn: 'Halkan ka gal',
    authorized: 'Kaliya shirkadaha loo oggolaaday ayaa geli kara nidaamkan.',
    passwordMismatch: 'Labada furaha sirta isma laha.',
    passwordLength: 'Furaha sirta waa inuu ka koobnaadaa ugu yaraan 12 xaraf.',
    signupSuccess: 'Akoonka waa la sameeyay. Xaqiiji iimaylkaaga si aad u sii wadato.',
    emailVerificationTitle: 'Xaqiiji Cinwaanka Iimaylkaaga',
    emailVerificationMessage: 'Waxaan koodh 6-god ah u dirnay:',
    emailVerificationCode: 'Koodhka 6-god ah',
    verifyEmail: 'Xaqiiji Iimaylka',
    resendVerificationCode: 'Dib u dir Koodhka Xaqiijinta',
    changeEmail: 'Beddel Iimaylka',
    verificationCodeSent: 'Koodh cusub ayaa la soo diray.',
    verificationCodeFailed: 'Koodhka xaqiijinta lama diri karin. Hubi adeegga iimaylka oo mar kale isku day.',
    verificationCodeInvalid: 'Koodhka xaqiijintu waa khaldan yahay ama wuu dhacay.',
    verificationExpired: 'Koodhku wuu dhacay. Codso koodh cusub si aad u sii wadato.',
    emailVerified: 'Iimaylka si guul leh ayaa loo xaqiijiyey!',
    verificationResendWait: 'Waxaad koodh kale codsan kartaa kadib',
    seconds: 'ilbiriqsi',
    emailVerificationEmailUnavailable: 'Adeegga iimaylka lama habayn. Ku dar SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL iyo SMTP_FROM_NAME Backend/.env kadibna dib u bilow API-ga.',
    signupProfileWarning: 'Iimaylka waa la xaqiijiyey, akoonkana waa la sameeyey, laakiin xogta shirkadda lama kaydin. Waad cusboonaysiin kartaa markaad gasho.',
    authFailed: 'Codsiga lama dhammaystirin. Hubi xogtaada oo mar kale isku day.',
    invalidCredentials: 'Iimaylka ama furaha sirta waa khalad.',
    duplicateAccount: 'Akoon iimaylkan wata horay ayuu u jiraa. Isku day inaad gasho.',
    connectionError: 'Adeeggu hadda ma shaqaynayo. Fadlan dhowaan mar kale isku day.',
    forgotTitle: 'Ma Illowday Furaha Sirta?',
    forgotText: 'Geli iimaylkaaga diiwaangashan. Waxaan kuu soo diri doonnaa koodh xaqiijin si aad u beddesho furaha sirta.',
    verifyResetTitle: 'Xaqiiji Iimaylkaaga',
    verifyResetText: 'Geli koodhka 6-god ah ee loo diray {email}.',
    resetInstructions: 'Dooro furaha sirta cusub oo adag ee akoonkaaga.',
    forgotEmail: 'Iimaylka Shirkadda',
    forgotEmailRequired: 'Marka hore geli iimayl sax ah oo shirkaddaada ah.',
    sendVerificationEmail: 'Dir Iimaylka Xaqiijinta',
    resetSent: 'Haddii iimaylkan akoon ku leeyahay, koodh 6-god ah ayaa loo soo diri doonaa.',
    resetCode: 'Koodhka xaqiijinta ee 6-god ah',
    verifyCode: 'Xaqiiji koodhka',
    resetCodeSent: 'Haddii iimaylkan akoon ku leeyahay, koodh xaqiijin ayaa loo diray. Fadlan hubi iimaylkaaga.',
    resetCodeVerified: 'Koodhka waa la xaqiijiyey. Sameyso furaha sirta cusub.',
    resetCodeInvalid: 'Geli koodhka 6-god ah ee saxda ah ee iimaylkaaga.',
    resetDigit: 'Lambarka {number} ee koodhka xaqiijinta',
    resendResetCode: 'Dib u Dir Koodhka Xaqiijinta',
    resetExpiresIn: 'Koodhku wuxuu dhacayaa kadib',
    resetResendIn: 'Dib ayaa loo diri karaa kadib',
    resetExpired: 'Koodhku wuu dhacay. Codso koodh cusub.',
    resetPasswordTitle: 'Sameyso Furaha Sirta Cusub',
    resetPasswordComplexity: 'Adeegso ugu yaraan 12 xaraf oo ka kooban xarfo yaryar, waaweyn, tiro iyo calaamad.',
    resetSuccessTitle: 'Furaha Sirta Si Guul Leh Ayaa Loo Beddelay!',
    resetSuccess: 'Furaha sirta si guul leh ayaa loo cusboonaysiiyey. Hadda waxaad ku geli kartaa furahaaga cusub.',
    resetFailed: 'Iimaylka xaqiijinta lama diri karin. Fadlan mar kale isku day.',
    emailServiceUnavailable: 'Adeegga iimaylka lama habayn. Ku dar SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL iyo SMTP_FROM_NAME Backend/.env kadibna dib u bilow API-ga.',
    resetRateLimited: 'Codsiyo badan ayaa la diray. Fadlan mar dambe isku day.',
    resetPassword: 'Beddel Furaha Sirta',
    newPassword: 'Furaha sirta cusub',
    confirmNewPassword: 'Xaqiiji furaha sirta cusub',
    resetInvalid: 'Xiriirka beddelka furaha waa khaldan yahay ama wuu dhacay.',
    close: 'Xir',
    manageCustomers: 'Maamul Macaamiisha',
    manageEmployees: 'Maamul Shaqaalaha',
    manageServices: 'Maamul Adeegyada',
    manageProjects: 'Maamul Mashaariicda',
    reports: 'Eeg Warbixinnada',
    tagline: 'Xalal Hal-abuur leh oo Mustaqbal Wanaagsan',
    welcome: 'Ku soo dhawoow SAFI SALI COMPANIES.',
    loginShowcaseDescription: 'Si ammaan ah u gal dashboard-kaaga, kuna maamul ganacsigaaga hal meel.',
    managementSolutions: 'Xalalka Maamulka Ganacsiga',
    grow: 'Kobci Ganacsigaaga adigoo adeegsanaya SAFI SALI COMPANIES',
    growDescription: 'Xalal dijitaal ah oo ganacsigaaga kobciya.',
    growDetails: 'Si hufan u shaqee. Si degdeg ah u koboc.',
    footer: '© {year} SAFI SALI COMPANIES. Xuquuqdu way xafidan tahay.',
    contact: 'Xiriirka Taageerada:',
    manageCustomersDescription: 'Habee xogta macaamiisha iyo xiriirrada ganacsiga.',
    manageEmployeesDescription: 'Maamul xogta, xilalka, iyo waxqabadka shaqaalaha.',
    manageServicesDescription: 'Abuur, habee, oo la soco adeegyada shirkadda.',
    manageProjectsDescription: 'Qorshee, la soco, oo maamul mashaariicda ganacsiga.',
    reportsDescription: 'Hel aragtiyo ganacsi, falanqayn, iyo warbixinnada waxqabadka.',
    showPassword: 'Muuji furaha sirta',
    hidePassword: 'Qari furaha sirta',
    acceptTerms: 'Waan aqbalay Shuruudaha iyo Xeerarka.',
    passwordStrength: 'Awoodda furaha sirta',
    strengthWeak: 'Daciif',
    strengthFair: 'Dhexdhexaad',
    strengthGood: 'Wanaagsan',
    strengthStrong: 'Aad u wanaagsan',
    chooseLanguage: 'Dooro luqadda',
    loading: 'Fadlan sug…',
  },
};

export const LoginPage: React.FC = () => {
  const { language, setLanguage, login, showToast } = useApp();
  const c = words[language];
  const [isSignUp, setIsSignUp] = useState(
    () => new URLSearchParams(window.location.search).get('mode') === 'signup'
  );
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(retainedLoginEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationEmailSent, setVerificationEmailSent] = useState(true);
  const [verificationSeconds, setVerificationSeconds] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [verificationPendingProfile, setVerificationPendingProfile] = useState<{
    companyName: string;
    ownerName: string;
    phone: string;
  } | null>(null);

  useEffect(() => {
    if (!verificationEmail) return undefined;
    const timer = window.setInterval(() => {
      setVerificationSeconds((remaining) => Math.max(0, remaining - 1));
      setResendSeconds((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [verificationEmail]);
  const [hasAccessAuthorization, setHasAccessAuthorization] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetToken, setResetToken] = useState(
    () => new URLSearchParams(window.location.search).get('resetToken') || ''
  );
  const [showForgot, setShowForgot] = useState(() => Boolean(
    new URLSearchParams(window.location.search).get('resetToken')
  ));
  const [resetPassword, setResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetExpiresSeconds, setResetExpiresSeconds] = useState(0);
  const [resetResendSeconds, setResetResendSeconds] = useState(0);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showConfirmResetPassword, setShowConfirmResetPassword] = useState(false);
  const resetCodeInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const syncAuthPage = () => {
      setIsSignUp(new URLSearchParams(window.location.search).get('mode') === 'signup');
    };
    window.addEventListener('popstate', syncAuthPage);
    return () => window.removeEventListener('popstate', syncAuthPage);
  }, []);

  const switchMode = (signup: boolean) => {
    setIsSignUp(signup);
    const currentUrl = new URL(window.location.href);
    if (signup) currentUrl.searchParams.set('mode', 'signup');
    else currentUrl.searchParams.delete('mode');
    window.history.pushState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirm(false);
  };

  const passwordStrength = (() => {
    const checks = [
      password.length >= 12,
      /[a-z]/.test(password),
      /[A-Z]/.test(password),
      /\d/.test(password),
      /[^A-Za-z0-9]/.test(password),
    ];
    const score = checks.filter(Boolean).length;
    return {
      score,
      label: score <= 2 ? c.strengthWeak : score === 3 ? c.strengthFair : score === 4 ? c.strengthGood : c.strengthStrong,
    };
  })();
  const resetPasswordStrength = (() => {
    const checks = [
      resetPassword.length >= 12,
      /[a-z]/.test(resetPassword),
      /[A-Z]/.test(resetPassword),
      /\d/.test(resetPassword),
      /[^A-Za-z0-9]/.test(resetPassword),
    ];
    const score = checks.filter(Boolean).length;
    return {
      score,
      label: score <= 2 ? c.strengthWeak : score === 3 ? c.strengthFair : score === 4 ? c.strengthGood : c.strengthStrong,
    };
  })();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!isSignUp && !hasAccessAuthorization) {
      showToast(c.authorizationRequired, 'error');
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      showToast(c.passwordMismatch, 'error');
      return;
    }
    if (isSignUp && !acceptedTerms) {
      showToast(c.acceptTerms, 'error');
      return;
    }
    if (password.length < 12) {
      showToast(c.passwordLength, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignUp) {
        const registration = await createBusinessAccount({
          name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          password,
          role: 'business_owner',
        });
        retainedLoginEmail = email.trim();
        setEmail(retainedLoginEmail);
        setVerificationEmail(registration.email);
        setVerificationCode('');
        setVerificationEmailSent(registration.emailSent);
        setVerificationSeconds(registration.expiresInSeconds);
        setResendSeconds(registration.resendAfterSeconds);
        setVerificationPendingProfile({
          companyName: companyName.trim(),
          ownerName: fullName.trim(),
          phone: phone.trim(),
        });
        setPassword('');
        setConfirmPassword('');
        switchMode(false);
        setAcceptedTerms(false);
        showToast(
          registration.emailSent ? c.signupSuccess : c.verificationCodeFailed,
          registration.emailSent ? 'success' : 'error'
        );
        return;
      }

      const result = await loginWithPassword(email.trim(), password);
      if (result.user.role !== 'super_admin') {
        await AppStore.loadWorkspace(result.user, result.token);
      }
      login(result.user);
      setPassword('');
    } catch (error) {
      if (!isSignUp) {
        clearStoredAccessToken();
        AppStore.clearWorkspaceCache();
      }
      console.error('Authentication request failed:', error);
      if (error instanceof Error && error.message === 'Email address has not been verified.') {
        setVerificationEmail(email.trim());
        setVerificationCode('');
        setVerificationEmailSent(true);
        setVerificationSeconds(0);
        setResendSeconds(0);
        return;
      }
      const message = error instanceof ApiConnectionError
        ? c.connectionError
        : error instanceof Error && error.message === 'Email verification is not configured on the server.'
          ? c.emailVerificationEmailUnavailable
        : error instanceof Error && error.message === 'Invalid email or password.'
          ? c.invalidCredentials
          : error instanceof Error && error.message === 'An account with this email already exists.'
            ? c.duplicateAccount
            : error instanceof Error
              ? error.message
              : c.authFailed;
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerificationSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !/^\d{6}$/.test(verificationCode)) {
      if (!/^\d{6}$/.test(verificationCode)) showToast(c.verificationCodeInvalid, 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const verified = await verifyEmailAddress(verificationEmail, verificationCode);
      setVerificationEmail('');
      setVerificationPendingProfile(null);
      setVerificationCode('');
      setVerificationEmailSent(true);
      showToast(c.emailVerified, 'success');
      let profileSaved = true;
      if (verificationPendingProfile) {
        try {
          await saveWorkspaceValue(verified.token, 'settings', {
            ...AppStore.getSettings(),
            businessName: verificationPendingProfile.companyName,
            ownerName: verificationPendingProfile.ownerName,
            phone: verificationPendingProfile.phone,
            email: verified.user.email,
          });
        } catch (error) {
          profileSaved = false;
          console.error('Email verified, but the company profile could not be saved:', error);
        }
      }
      try {
        if (verified.user.role !== 'super_admin') {
          await AppStore.loadWorkspace(verified.user, verified.token);
        }
      } catch (error) {
        clearStoredAccessToken();
        AppStore.clearWorkspaceCache();
        console.error('Email verified, but the workspace could not be loaded:', error);
        showToast(error instanceof Error ? error.message : c.connectionError, 'error');
        return;
      }
      login(verified.user);
      if (!profileSaved) showToast(c.signupProfileWarning, 'info');
    } catch (error) {
      console.error('Email verification failed:', error);
      const message = error instanceof ApiConnectionError
        ? c.connectionError
        : error instanceof Error && error.message.includes('invalid or has expired')
          ? c.verificationCodeInvalid
          : error instanceof Error && error.message === 'Email verification is not configured on the server.'
            ? c.emailVerificationEmailUnavailable
            : error instanceof Error && error.message !== 'The request could not be completed.'
              ? error.message
              : c.verificationCodeInvalid;
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerificationCode = async () => {
    if (isSubmitting || resendSeconds > 0) return;
    setIsSubmitting(true);
    try {
      await resendEmailVerificationCode(verificationEmail);
      setVerificationCode('');
      setVerificationEmailSent(true);
      setVerificationSeconds(600);
      setResendSeconds(60);
      showToast(c.verificationCodeSent, 'success');
    } catch (error) {
      console.error('Email verification code could not be resent:', error);
      const message = error instanceof ApiConnectionError
        ? c.connectionError
        : error instanceof Error && error.message.includes('wait before requesting')
          ? error.message
          : error instanceof Error && error.message === 'Email verification is not configured on the server.'
            ? c.emailVerificationEmailUnavailable
            : error instanceof Error && error.message !== 'The request could not be completed.'
              ? error.message
              : c.verificationCodeFailed;
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeVerificationEmail = () => {
    setVerificationEmail('');
    setVerificationCode('');
    setVerificationEmailSent(true);
    setVerificationPendingProfile(null);
    setPassword('');
    setConfirmPassword('');
    switchMode(true);
  };

  const closePasswordReset = () => {
    setShowForgot(false);
    setResetToken('');
    setResetCode('');
    setResetEmailSent(false);
    setResetExpiresSeconds(0);
    setResetResendSeconds(0);
    setResetSuccess(false);
    setResetPassword('');
    setConfirmResetPassword('');
    setShowResetPassword(false);
    setShowConfirmResetPassword(false);
    if (new URLSearchParams(window.location.search).has('resetToken')) {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('resetToken');
      window.history.replaceState(
        {},
        '',
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
      );
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  useEffect(() => {
    if (!resetEmailSent || resetToken || resetSuccess) return undefined;
    const timer = window.setInterval(() => {
      setResetExpiresSeconds((remaining) => Math.max(0, remaining - 1));
      setResetResendSeconds((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resetEmailSent, resetToken, resetSuccess]);

  useEffect(() => {
    if (!resetEmailSent || resetToken || resetSuccess) return;
    resetCodeInputRefs.current[0]?.focus();
  }, [resetEmailSent, resetToken, resetSuccess]);

  useEffect(() => {
    if (!resetSuccess) return undefined;
    const redirectTimer = window.setTimeout(closePasswordReset, 3000);
    return () => window.clearTimeout(redirectTimer);
  }, [resetSuccess]);

  const updateResetCode = (index: number, value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length > 1) {
      const pastedDigits = digits.slice(0, 6);
      setResetCode(pastedDigits);
      resetCodeInputRefs.current[Math.min(pastedDigits.length, 5)]?.focus();
      return;
    }

    const nextCode = resetCode.padEnd(6, ' ').split('');
    nextCode[index] = digits;
    const normalizedCode = nextCode.join('').replace(/\s+$/, '');
    setResetCode(normalizedCode);
    if (digits && index < 5) resetCodeInputRefs.current[index + 1]?.focus();
  };

  const handleResetCodePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    event.preventDefault();
    setResetCode(digits);
    resetCodeInputRefs.current[Math.min(digits.length, 5)]?.focus();
  };

  const handleResetCodeKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Backspace' && !resetCode[index] && index > 0) {
      resetCodeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleResendPasswordResetCode = async () => {
    if (isSubmitting || resetResendSeconds > 0) return;
    setIsSubmitting(true);
    try {
      await resendPasswordResetCode(email.trim());
      setResetCode('');
      setResetExpiresSeconds(600);
      setResetResendSeconds(60);
      showToast(c.resetSent, 'success');
    } catch (error) {
      console.error('Password reset code could not be resent:', error);
      const message = error instanceof ApiConnectionError
        ? c.connectionError
        : error instanceof Error && error.message === 'Password reset email is not configured on the server.'
          ? c.emailServiceUnavailable
          : error instanceof Error && error.message.includes('Too many')
            ? c.resetRateLimited
            : error instanceof Error && error.message !== 'The request could not be completed.'
              ? error.message
              : c.resetFailed;
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordResetSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!resetToken && !resetEmailSent && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showToast(c.forgotEmailRequired, 'error');
      return;
    }
    if (!resetToken && resetEmailSent && !/^\d{6}$/.test(resetCode)) {
      showToast(c.resetCodeInvalid, 'error');
      return;
    }
    if (resetToken && resetPassword !== confirmResetPassword) {
      showToast(c.passwordMismatch, 'error');
      return;
    }
    if (resetToken && resetPasswordStrength.score < 5) {
      showToast(
        resetPassword.length < 12 ? c.passwordLength : c.resetPasswordComplexity,
        'error'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (resetToken) {
        await completePasswordReset(resetToken, resetPassword);
        setResetToken('');
        setResetSuccess(true);
        setResetPassword('');
        setConfirmResetPassword('');
        showToast(c.resetSuccess, 'success');
      } else if (resetEmailSent) {
        const verifiedToken = await verifyPasswordResetCode(email.trim(), resetCode);
        setResetToken(verifiedToken);
        setResetEmailSent(false);
        setResetCode('');
        setResetExpiresSeconds(0);
        setResetResendSeconds(0);
        showToast(c.resetCodeVerified, 'success');
      } else {
        await requestPasswordReset(email.trim());
        setResetEmailSent(true);
        setResetExpiresSeconds(600);
        setResetResendSeconds(60);
        showToast(c.resetSent, 'success');
      }
    } catch (error) {
      console.error('Password reset request failed:', error);
      let message = c.resetFailed;
      if (error instanceof ApiConnectionError) {
        message = c.connectionError;
      } else if (error instanceof Error) {
        if (error.message === 'Password reset email is not configured on the server.') {
          message = c.emailServiceUnavailable;
        } else if (error.message === 'Too many requests. Please try again later.') {
          message = c.resetRateLimited;
        } else if (error.message.includes('invalid or has expired')) {
          message = resetEmailSent ? c.resetCodeInvalid : c.resetInvalid;
        } else if (error.message.includes('lowercase, uppercase, number, and symbol')) {
          message = c.resetPasswordComplexity;
        } else if (error.message.includes('Too many')) {
          message = c.resetRateLimited;
        } else if (error.message !== 'The request could not be completed.') {
          message = error.message;
        }
      }
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const year = new Date().getFullYear();

  return (
    <main lang={language} className="safi-auth min-h-dvh w-full bg-white text-slate-900">
      <div className="safi-auth-layout grid min-h-dvh w-full grid-cols-1 lg:grid-cols-[45%_55%]">
        <section className="safi-auth-showcase relative flex min-h-[350px] flex-col overflow-hidden bg-[#0B1733] px-5 py-5 text-white sm:px-8 sm:py-7 lg:min-h-dvh lg:px-10 lg:py-8 xl:px-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_25%,rgba(36,87,214,.34),transparent_48%),linear-gradient(145deg,transparent_45%,rgba(214,173,85,.10))]" />
          <img
            src={isSignUp ? '/assets/company-signup-portrait.jpg' : '/assets/company-login-portrait.jpg'}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 hidden h-[72%] w-[43%] object-cover object-top opacity-[.14] mix-blend-screen lg:block"
          />
          <div className="safi-auth-showcase-brand relative z-10 flex items-center gap-3">
            <div className="rounded-xl bg-white px-3 py-1.5 shadow-lg shadow-slate-950/15 sm:px-4 sm:py-2">
              <Logo size="auth" className="safi-auth-brand" />
            </div>
          </div>

          <div className="safi-auth-copy relative z-10 w-full max-w-[620px] py-7 text-left sm:py-8 lg:py-10">
            <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-[#D6AD55] sm:text-sm">
              {c.tagline}
            </p>
            <h1 className="max-w-[560px] text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-[2.65rem]">
              {isSignUp ? c.signup : c.login}
            </h1>
            <div className="mt-4 grid max-w-[600px] grid-cols-1 gap-3">
              <p className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-3.5 text-lg leading-8 text-blue-50 sm:px-5 sm:py-4 sm:text-xl sm:leading-9">
                {c.welcome}
              </p>
              <p className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-3.5 text-base leading-7 text-blue-100 sm:px-5 sm:py-4 sm:text-lg sm:leading-8">
                {isSignUp ? c.signupIntro : c.loginShowcaseDescription}
              </p>
            </div>
            <section className="mt-7 max-w-[600px] sm:mt-8" aria-labelledby="management-solutions-title">
              <h2 id="management-solutions-title" className="text-sm font-extrabold uppercase tracking-[.16em] text-[#D6AD55] sm:text-base">
                {c.managementSolutions}
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <Feature
                  icon={UsersRound}
                  label={c.manageCustomers}
                  description={c.manageCustomersDescription}
                  className="safi-feature-wide"
                />
                <Feature
                  icon={UserRoundCog}
                  label={c.manageEmployees}
                  description={c.manageEmployeesDescription}
                  className="safi-feature-wide"
                />
                <Feature
                  icon={Building2}
                  label={c.manageServices}
                  description={c.manageServicesDescription}
                  className="safi-feature-wide"
                />
                <Feature
                  icon={FolderKanban}
                  label={c.manageProjects}
                  description={c.manageProjectsDescription}
                  className="safi-feature-wide"
                />
                <Feature
                  icon={ChartNoAxesCombined}
                  label={c.reports}
                  description={c.reportsDescription}
                  className="safi-feature-wide"
                />
              </div>
            </section>
            <section className="mt-7 max-w-[600px] rounded-xl border border-white/15 border-l-4 border-l-[#D6AD55] bg-white/[.06] px-4 py-4 sm:mt-8 sm:px-5 sm:py-5">
              <p className="text-base font-extrabold leading-6 text-[#D6AD55] sm:text-lg sm:leading-7">{c.grow}</p>
              <p className="mt-2 text-base leading-7 text-blue-50 sm:text-lg sm:leading-8">{c.growDescription}</p>
            </section>
          </div>

          <div className="safi-auth-showcase-footer relative z-10 hidden items-center border-t border-white/20 pt-3 text-left text-blue-100 lg:flex">
            <span>{c.footer.replace('{year}', String(year))}</span>
            <ContactLinks label={c.contact} />
          </div>
        </section>

        <section className="safi-auth-form-section relative flex min-h-[calc(100dvh-350px)] flex-col items-center justify-center bg-[#F5F7FC] px-4 py-8 sm:px-8 sm:py-10 lg:min-h-dvh lg:px-10 lg:py-4">
          <div className="safi-auth-form-wrap relative w-full max-w-[470px]">
            <div className="safi-auth-language absolute right-0 top-0 z-10">
              <LanguageSwitch language={language} setLanguage={setLanguage} label={c.chooseLanguage} />
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_65px_rgba(8,32,82,.14)]">
              <div className="h-1.5 bg-gradient-to-r from-[#0B1733] via-[#2457D6] to-[#D6AD55]" />
              <div className="safi-auth-brand-header flex items-center justify-center border-b border-slate-100 px-3">
                <Logo size="auth" className="safi-auth-form-brand" />
              </div>
              <div className="px-5 pb-4 pt-4 sm:px-8 sm:pb-4 sm:pt-4">
                {verificationEmail ? (
                  <section aria-labelledby="email-verification-title">
                    <div className="rounded-xl bg-[#2457D6] px-4 py-3 text-center text-white shadow-sm">
                      <div className="flex items-center justify-center gap-2.5">
                        <Mail className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <h2 id="email-verification-title" className="text-lg font-extrabold sm:text-xl">
                          {c.emailVerificationTitle}
                        </h2>
                      </div>
                    </div>
                    <p className="mt-4 text-center text-sm leading-6 text-slate-600">
                      {c.emailVerificationMessage}
                    </p>
                    <p className="mt-1 break-all text-center text-sm font-bold text-[#173d7c]">
                      {verificationEmail}
                    </p>
                    {!verificationEmailSent && (
                      <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-800">
                        {c.verificationCodeFailed}
                      </p>
                    )}
                    <form onSubmit={handleVerificationSubmit} className="mt-5 space-y-3">
                      <label htmlFor="email-verification-code" className="block text-sm font-semibold text-slate-700">
                        {c.emailVerificationCode}
                      </label>
                      <input
                        id="email-verification-code"
                        required
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-center text-xl font-extrabold tracking-[0.5em] text-slate-900 outline-none focus:border-[#2457D6] focus:ring-2 focus:ring-blue-100"
                      />
                      <p role="status" className="text-center text-xs text-slate-500">
                        {!verificationEmailSent
                          ? c.verificationCodeFailed
                          : verificationSeconds > 0
                            ? `${c.verificationResendWait} ${Math.floor(verificationSeconds / 60)}:${String(verificationSeconds % 60).padStart(2, '0')}.`
                            : c.verificationExpired}
                      </p>
                      <button
                        type="submit"
                        disabled={isSubmitting || !verificationEmailSent || verificationSeconds === 0}
                        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#D6AD55] to-[#e9c879] px-4 py-3 text-base font-extrabold text-[#0B1733] shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSubmitting ? c.loading : c.verifyEmail}
                      </button>
                    </form>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleResendVerificationCode}
                        disabled={isSubmitting || resendSeconds > 0}
                        className="flex min-h-11 items-center justify-center rounded-xl border border-[#2457D6] px-3 py-2 text-sm font-bold text-[#2457D6] transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {resendSeconds > 0
                          ? `${c.resendVerificationCode} (${resendSeconds}s)`
                          : c.resendVerificationCode}
                      </button>
                      <button
                        type="button"
                        onClick={changeVerificationEmail}
                        className="flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        {c.changeEmail}
                      </button>
                    </div>
                  </section>
                ) : (
                  <>
                <div className="rounded-xl bg-[#2457D6] px-4 py-3 text-center text-white shadow-sm sm:py-3">
                  <div className="flex items-center justify-center gap-2.5">
                    <Building2 className="h-6 w-6 shrink-0" aria-hidden="true" />
                    <h2 className="text-lg font-extrabold tracking-wide sm:text-xl">
                      {isSignUp ? c.signup : c.login}
                    </h2>
                  </div>
                </div>
                <p className="mt-2 text-center text-sm leading-6 text-slate-600 sm:text-[15px]">
                  {isSignUp ? c.signupIntro : c.loginIntro}
                </p>

                <form
                  onSubmit={handleSubmit}
                  className="mt-4 space-y-2.5 sm:mt-4 sm:space-y-1.5"
                  aria-label={isSignUp ? c.signup : c.login}
                >
                  {isSignUp && (
                    <>
                    <Field icon={<UserRound />} label={c.fullName}>
                      <input
                        required
                        autoComplete="name"
                        maxLength={120}
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder={c.fullNamePlaceholder}
                      />
                    </Field>
                    <Field icon={<Building2 />} label={c.company}>
                      <input
                        required
                        autoComplete="organization"
                        maxLength={120}
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                        placeholder={c.companyPlaceholder}
                      />
                    </Field>
                    </>
                  )}
                  <Field icon={<Mail />} label={c.email}>
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        retainedLoginEmail = event.target.value;
                      }}
                      placeholder={c.emailPlaceholder}
                    />
                  </Field>
                  <Field icon={<LockKeyhole />} label={c.password}>
                    <input
                      required
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      minLength={12}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={c.passwordPlaceholder}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? c.hidePassword : c.showPassword}
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="safi-eye"
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </Field>
                  {isSignUp && password.length > 0 && (
                    <div className="space-y-1 px-1" aria-live="polite">
                      <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                        <span>{c.passwordStrength}</span>
                        <span>{passwordStrength.label}</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1" role="meter" aria-label={c.passwordStrength} aria-valuemin={0} aria-valuemax={5} aria-valuenow={passwordStrength.score}>
                        {Array.from({ length: 5 }, (_, index) => (
                          <span key={index} className={`h-1.5 rounded-full transition-colors ${index < passwordStrength.score ? passwordStrength.score <= 2 ? 'bg-rose-500' : passwordStrength.score === 3 ? 'bg-amber-500' : passwordStrength.score === 4 ? 'bg-blue-500' : 'bg-emerald-500' : 'bg-slate-200'}`} />
                        ))}
                      </div>
                    </div>
                  )}
                  {isSignUp && (
                    <>
                      <Field icon={<LockKeyhole />} label={c.confirm}>
                        <input
                          required
                          type={showConfirm ? 'text' : 'password'}
                          autoComplete="new-password"
                          minLength={12}
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          placeholder={c.confirmPlaceholder}
                        />
                        <button
                          type="button"
                          aria-label={showConfirm ? c.hidePassword : c.showPassword}
                          onClick={() => setShowConfirm((visible) => !visible)}
                          className="safi-eye"
                        >
                          {showConfirm ? <EyeOff /> : <Eye />}
                        </button>
                      </Field>
                      <Field icon={<Phone />} label={c.phone}>
                        <input
                          required
                          type="tel"
                          autoComplete="tel"
                          maxLength={40}
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          placeholder={c.phonePlaceholder}
                        />
                      </Field>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                        <input
                          required
                          type="checkbox"
                          checked={acceptedTerms}
                          onChange={(event) => setAcceptedTerms(event.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#2457D6]"
                        />
                        <span>{c.acceptTerms}</span>
                      </label>
                    </>
                  )}

                  {!isSignUp && (
                    <>
                      <div className="flex flex-wrap items-center justify-end gap-2 px-1 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setResetEmailSent(false);
                            setShowForgot(true);
                          }}
                          className="font-semibold text-[#2457D6] underline-offset-2 hover:underline"
                        >
                          {c.forgot}
                        </button>
                      </div>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-[#173d7c]">
                        <input
                          required
                          type="checkbox"
                          checked={hasAccessAuthorization}
                          onChange={(event) => setHasAccessAuthorization(event.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#0b2a66]"
                        />
                        <span>{c.accessAuthorization}</span>
                      </label>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || (!isSignUp && !hasAccessAuthorization)}
                    className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#D6AD55] to-[#e9c879] px-4 py-3 text-base font-extrabold text-[#0B1733] shadow-md shadow-amber-900/15 transition hover:brightness-105 active:scale-[.99] disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      c.loading
                    ) : (
                      <>
                        <LogIn className="h-5 w-5" aria-hidden="true" />
                        {isSignUp ? c.signupButton : c.loginButton}
                      </>
                    )}
                  </button>
                  <div className="flex items-center gap-3 py-0.5 text-xs font-semibold text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    {language === 'so' ? 'AMA' : 'OR'}
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isSignUp) switchMode(false);
                      else if (window.history.length > 1) window.history.back();
                      else window.location.assign('/');
                    }}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-[#102d66] transition hover:bg-slate-50"
                  >
                    {isSignUp ? <ArrowLeft className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                    {isSignUp ? c.backLogin : c.backPortal}
                  </button>
                  <p className="pt-1 text-center text-sm leading-6 text-slate-600">
                    {isSignUp ? c.haveAccount : c.noAccount}{' '}
                    <button
                      type="button"
                      onClick={() => switchMode(!isSignUp)}
                      className="font-bold text-[#2457D6] underline underline-offset-2"
                    >
                      {isSignUp ? c.signIn : c.create}
                    </button>
                  </p>
                </form>
                  </>
                )}
              </div>
            </div>
            <div className="safi-auth-authorization mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-center text-xs font-semibold leading-4 text-[#173d7c]">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#173d7c]" aria-hidden="true" />
              {c.authorized}
            </div>
          </div>
          <div className="safi-auth-mobile-footer mt-auto flex flex-col items-center justify-center pt-7 text-center text-xs text-slate-400 lg:hidden">
            <span className="safi-auth-mobile-copyright">{c.footer.replace('{year}', String(year))}</span>
            <ContactLinks label={c.contact} />
          </div>
        </section>
      </div>

      {showForgot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePasswordReset();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-title"
            className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
          >
            <button
              type="button"
              onClick={closePasswordReset}
              aria-label={c.close}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2457D6]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="mb-5 flex justify-center">
              <Logo size="auth" className="max-h-10 w-auto" />
            </div>
            {resetSuccess ? (
              <div className="py-2 text-center" role="status" aria-live="polite">
                <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" aria-hidden="true" />
                <h3 id="forgot-title" className="text-xl font-extrabold text-slate-900">{c.resetSuccessTitle}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{c.resetSuccess}</p>
                <p className="mt-4 text-xs font-medium text-slate-500">{c.backLogin}…</p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-[#123574]">
                  {resetToken ? <LockKeyhole /> : resetEmailSent ? <ShieldCheck /> : <Mail />}
                </div>
                <h3 id="forgot-title" className="text-lg font-extrabold text-slate-900">
                  {resetToken
                    ? c.resetPasswordTitle
                    : resetEmailSent
                      ? c.verifyResetTitle
                      : c.forgotTitle}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {resetToken
                    ? c.resetInstructions
                    : resetEmailSent
                      ? c.verifyResetText.replace('{email}', maskEmail(email.trim()))
                      : c.forgotText}
                </p>
                <form onSubmit={handlePasswordResetSubmit}>
                  {resetToken ? (
                    <>
                      <label htmlFor="reset-password" className="mt-4 block text-sm font-semibold text-slate-700">
                        {c.newPassword}
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="reset-password"
                          required
                          type={showResetPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          minLength={12}
                          value={resetPassword}
                          onChange={(event) => setResetPassword(event.target.value)}
                          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 pr-11 text-sm text-slate-900 outline-none focus:border-[#2457D6] focus:ring-2 focus:ring-blue-100"
                        />
                        <button type="button" onClick={() => setShowResetPassword((visible) => !visible)} aria-label={showResetPassword ? c.hidePassword : c.showPassword} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500">
                          {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="mt-2" aria-label={`${c.passwordStrength}: ${resetPasswordStrength.label}`}>
                        <div className="flex gap-1" aria-hidden="true">
                          {Array.from({ length: 5 }, (_, index) => (
                            <span
                              key={index}
                              className={`h-1.5 flex-1 rounded-full ${
                                index < resetPasswordStrength.score
                                  ? resetPasswordStrength.score < 3
                                    ? 'bg-rose-500'
                                    : resetPasswordStrength.score < 5
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  : 'bg-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {c.passwordStrength}: {resetPasswordStrength.label}. {c.resetPasswordComplexity}
                        </p>
                      </div>
                      <label htmlFor="confirm-reset-password" className="mt-3 block text-sm font-semibold text-slate-700">
                        {c.confirmNewPassword}
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="confirm-reset-password"
                          required
                          type={showConfirmResetPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          minLength={12}
                          value={confirmResetPassword}
                          onChange={(event) => setConfirmResetPassword(event.target.value)}
                          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 pr-11 text-sm text-slate-900 outline-none focus:border-[#2457D6] focus:ring-2 focus:ring-blue-100"
                        />
                        <button type="button" onClick={() => setShowConfirmResetPassword((visible) => !visible)} aria-label={showConfirmResetPassword ? c.hidePassword : c.showPassword} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500">
                          {showConfirmResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </>
                  ) : resetEmailSent ? (
                    <>
                      <p role="status" aria-live="polite" className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-800">
                        {c.resetCodeSent}
                      </p>
                      <label className="mt-4 block text-sm font-semibold text-slate-700">{c.resetCode}</label>
                      <div className="mt-2 grid grid-cols-6 gap-2" dir="ltr">
                        {Array.from({ length: 6 }, (_, index) => (
                          <input
                            key={index}
                            ref={(element) => { resetCodeInputRefs.current[index] = element; }}
                            aria-label={c.resetDigit.replace('{number}', String(index + 1))}
                            type="text"
                            inputMode="numeric"
                            autoComplete={index === 0 ? 'one-time-code' : 'off'}
                            pattern="[0-9]"
                            maxLength={index === 0 ? 6 : 1}
                            value={resetCode[index] || ''}
                            onChange={(event) => updateResetCode(index, event.target.value)}
                            onPaste={handleResetCodePaste}
                            onKeyDown={(event) => handleResetCodeKeyDown(event, index)}
                            className="h-12 min-w-0 rounded-lg border border-slate-300 text-center text-xl font-bold text-slate-900 outline-none focus:border-[#2457D6] focus:ring-2 focus:ring-blue-100"
                          />
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-slate-500" aria-live="polite">
                        <span>
                          {resetExpiresSeconds > 0
                            ? `${c.resetExpiresIn} ${Math.floor(resetExpiresSeconds / 60)}:${String(resetExpiresSeconds % 60).padStart(2, '0')}`
                            : c.resetExpired}
                        </span>
                        {resetResendSeconds > 0 && (
                          <span>{c.resetResendIn} {resetResendSeconds}s</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <label htmlFor="forgot-email" className="mt-4 block text-sm font-semibold text-slate-700">
                        {c.forgotEmail}
                      </label>
                      <input
                        id="forgot-email"
                        required
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          setResetEmailSent(false);
                          setResetExpiresSeconds(0);
                          setResetResendSeconds(0);
                        }}
                        placeholder={c.emailPlaceholder}
                        className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-[#2457D6] focus:ring-2 focus:ring-blue-100"
                      />
                    </>
                  )}
                  {!resetSuccess && (
                    <button
                      type="submit"
                      disabled={isSubmitting || (resetEmailSent && !resetToken && resetExpiresSeconds === 0)}
                      className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2457D6] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1745b2] disabled:cursor-wait disabled:opacity-60"
                    >
                      {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {isSubmitting
                        ? c.loading
                        : resetToken
                          ? c.resetPassword
                          : resetEmailSent
                            ? c.verifyCode
                            : c.sendVerificationEmail}
                    </button>
                  )}
                  {resetEmailSent && !resetToken && !resetSuccess && (
                    <button
                      type="button"
                      disabled={isSubmitting || resetResendSeconds > 0}
                      onClick={() => void handleResendPasswordResetCode()}
                      className="mt-2 flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#123574] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resetResendSeconds > 0
                        ? `${c.resendResetCode} (${resetResendSeconds}s)`
                        : c.resendResetCode}
                    </button>
                  )}
                </form>
                <button
                  type="button"
                  onClick={closePasswordReset}
                  className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-[#123574]"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {c.backLogin}
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
};

function LanguageSwitch({
  language,
  setLanguage,
  label,
}: {
  language: Language;
  setLanguage: (language: Language) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-0 rounded-full border border-slate-200 bg-white/95 p-0.5 shadow-sm"
    >
      <Globe className="ml-1.5 h-3.5 w-3.5 text-[#102d66]" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setLanguage('en')}
        aria-pressed={language === 'en'}
        className={`rounded-full px-2 py-1 text-[11px] font-bold transition ${
          language === 'en' ? 'bg-[#102d66] text-white' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => setLanguage('so')}
        aria-pressed={language === 'so'}
        className={`rounded-full px-2 py-1 text-[11px] font-bold transition ${
          language === 'so' ? 'bg-[#102d66] text-white' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        Soomaali
      </button>
    </div>
  );
}

function ContactLinks({ label }: { label: string }) {
  const contacts = [
    { number: '+252 613 078 734', url: 'https://wa.me/252613078734' },
    { number: '+252 683 723 015', url: 'https://wa.me/252683723015' },
  ];

  return (
    <span className="safi-auth-contact-links inline-flex items-center gap-x-2 whitespace-nowrap">
      <span className="font-medium">{label}</span>
      {contacts.map(({ number, url }, index) => (
        <React.Fragment key={number}>
          {index > 0 && <span aria-hidden="true">/</span>}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${label} ${number} on WhatsApp`}
            className="safi-auth-contact-link font-semibold underline decoration-current underline-offset-2 transition hover:text-white"
          >
            {number}
          </a>
        </React.Fragment>
      ))}
    </span>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <span className="safi-field">
        <span className="safi-field-icon" aria-hidden="true">{icon}</span>
        {children}
      </span>
    </label>
  );
}

function Feature({
  icon,
  label,
  description,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  className?: string;
}) {
  const Icon = icon;
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-white/15 bg-white/[.06] px-4 py-3.5 text-white sm:px-5 sm:py-4 ${className ?? ''}`}>
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D6AD55]/15 text-[#D6AD55] ring-1 ring-[#D6AD55]/30">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="safi-feature-copy">
        <p className="safi-feature-label text-base font-bold leading-6 sm:text-lg sm:leading-7">{label}</p>
        <p className="safi-feature-description mt-1 text-[15px] leading-6 text-blue-100 sm:text-base sm:leading-7">{description}</p>
      </div>
    </div>
  );
}
