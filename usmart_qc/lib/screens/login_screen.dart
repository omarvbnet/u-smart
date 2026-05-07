import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/api_config.dart';
import '../constants/iraq_provinces.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import 'privacy_policy_screen.dart';
import 'registration_request_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with TickerProviderStateMixin {
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _phoneOtpCtrl = TextEditingController();
  final _otpCodeCtrl = TextEditingController();
  final _regNameCtrl = TextEditingController();
  final _regPhoneCtrl = TextEditingController();
  final _regCompanyCtrl = TextEditingController();
  String? _signupProvince;
  bool _usePasswordLogin = false;
  bool _otpSent = false;
  bool _otpSendLoading = false;
  bool _otpVerifyLoading = false;
  bool _showSignupFields = false;
  String _signupRole = 'COMPANY';
  bool _obscure = true;
  bool _submitting = false;
  String _forgotUsername = '';
  String _forgotCode = '';
  bool _forgotSending = false;
  bool _forgotVerifying = false;
  /// Shown inside the forgot sheet so SnackBars are not hidden behind the modal.
  String? _forgotInlineMsg;
  bool _forgotInlineIsErr = false;
  int _forgotResendCooldown = 0;
  Timer? _forgotCooldownTimer;
  VoidCallback? _forgotSheetRedraw;

  void _notifyForgotSheet() {
    if (mounted) setState(() {});
    _forgotSheetRedraw?.call();
  }

  void _startForgotResendCooldown() {
    _forgotCooldownTimer?.cancel();
    if (!mounted) return;
    setState(() => _forgotResendCooldown = 60);
    _forgotCooldownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_forgotResendCooldown <= 1) {
        _forgotCooldownTimer?.cancel();
        setState(() => _forgotResendCooldown = 0);
      } else {
        setState(() => _forgotResendCooldown--);
      }
      _forgotSheetRedraw?.call();
    });
    _notifyForgotSheet();
  }
  bool _agreedToTerms = false;
  late AnimationController _animCtrl;
  late Animation<double> _fadeIn;
  late Animation<Offset> _slideUp;
  late AnimationController _logoCtrl;
  late Animation<double> _logoScale;
  late Animation<double> _logoRotate;
  late Animation<double> _logoGlow;

  @override
  void initState() {
    super.initState();
    _animCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _fadeIn = CurvedAnimation(parent: _animCtrl, curve: Curves.easeOut);
    _slideUp = Tween<Offset>(
      begin: const Offset(0, 0.15),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _animCtrl, curve: Curves.easeOutCubic));
    _logoCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2600),
    )..repeat(reverse: true);
    _logoScale = Tween<double>(begin: 0.96, end: 1.06).animate(
      CurvedAnimation(parent: _logoCtrl, curve: Curves.easeInOutSine),
    );
    _logoRotate = Tween<double>(begin: -0.02, end: 0.02).animate(
      CurvedAnimation(parent: _logoCtrl, curve: Curves.easeInOut),
    );
    _logoGlow = Tween<double>(begin: 40, end: 70).animate(
      CurvedAnimation(parent: _logoCtrl, curve: Curves.easeInOutCubic),
    );
    _animCtrl.forward();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadSavedCredentials());
  }

  Future<void> _loadSavedCredentials() async {
    final auth = context.read<AuthProvider>();
    final creds = await auth.getSavedCredentials();
    if (mounted && creds != null) {
      _usernameCtrl.text = creds.username;
      _passwordCtrl.text = creds.password;
    }
  }

  String _normalizePhone(String s) {
    final t = s.trim();
    if (t.isEmpty) return '';
    if (t.startsWith('+')) return '+${t.substring(1).replaceAll(RegExp(r'\D'), '')}';
    return '+${t.replaceAll(RegExp(r'\D'), '')}';
  }

  String _signupRoleLabel(AppLocalizations l10n, String code) {
    switch (code) {
      case 'ENGINEER':
        return l10n.t('role_engineer');
      case 'TECHNICIAN':
        return l10n.t('role_technician');
      case 'PERSONAL':
        return l10n.t('role_personal');
      case 'WORKER':
        return l10n.t('role_worker');
      case 'COMPANY':
      default:
        return l10n.t('role_company');
    }
  }

  String _signupRoleHintKey(String code) {
    switch (code) {
      case 'ENGINEER':
        return 'reg_role_engineer_hint';
      case 'TECHNICIAN':
        return 'reg_role_technician_hint';
      case 'PERSONAL':
        return 'reg_role_personal_hint';
      case 'WORKER':
        return 'reg_role_worker_hint';
      case 'COMPANY':
      default:
        return 'reg_role_company_hint';
    }
  }

  Future<void> _sendPhoneOtp(AppLocalizations l10n) async {
    if (!_agreedToTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('privacy_agree_required')),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    final phone = _normalizePhone(_phoneOtpCtrl.text);
    if (phone.length < 8) {
      _showSnack('Enter a valid phone number', isError: true);
      return;
    }
    setState(() => _otpSendLoading = true);
    final err = await context.read<AuthProvider>().sendLoginPhoneOtp(phone);
    if (!mounted) return;
    setState(() {
      _otpSendLoading = false;
      if (err == null) _otpSent = true;
    });
    _showSnack(err ?? l10n.t('code_sent'), isError: err != null);
  }

  Future<void> _submitOtpLogin(AppLocalizations l10n) async {
    if (!_agreedToTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.t('privacy_agree_required')),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    setState(() => _otpVerifyLoading = true);
    final ok = await context.read<AuthProvider>().loginWithPhoneOtp(
          _normalizePhone(_phoneOtpCtrl.text),
          _otpCodeCtrl.text.trim(),
        );
    if (!mounted) return;
    setState(() => _otpVerifyLoading = false);
    if (!ok) {
      final err = context.read<AuthProvider>().error;
      _showSnack(
        err == AuthProvider.invalidCredentialsMarker
            ? l10n.t('invalid_code')
            : (err ?? l10n.t('login_failed')),
        isError: true,
      );
    }
  }

  Future<void> _submitOtpRegister(AppLocalizations l10n) async {
    if (!_agreedToTerms) return;
    final name = _regNameCtrl.text.trim();
    final phone = _regPhoneCtrl.text.trim();
    if (name.isEmpty || phone.isEmpty) {
      _showSnack('${l10n.t('signup_name')} / ${l10n.t('signup_phone')}', isError: true);
      return;
    }
    setState(() => _otpVerifyLoading = true);
    final ok = await context.read<AuthProvider>().registerWithPhoneOtp(
          phone: _normalizePhone(phone),
          code: _otpCodeCtrl.text.trim(),
          name: name,
          email: null,
          role: _signupRole,
          province: _signupProvince,
          company: _regCompanyCtrl.text.trim().isEmpty ? null : _regCompanyCtrl.text.trim(),
        );
    if (!mounted) return;
    setState(() => _otpVerifyLoading = false);
    if (!ok) {
      final err = context.read<AuthProvider>().error;
      _showSnack(err ?? l10n.t('login_failed'), isError: true);
    }
  }

  Future<void> _login() async {
    if (!_agreedToTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).t('privacy_agree_required')),
          backgroundColor: const Color(0xFFFF4757),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    final username = _usernameCtrl.text.trim();
    final password = _passwordCtrl.text;
    if (username.isEmpty || password.isEmpty) return;

    setState(() => _submitting = true);
    final auth = context.read<AuthProvider>();
    final success = await auth.login(username, password);
    if (!success && mounted) {
      final l10n = AppLocalizations.of(context);
      final err = auth.error;
      final message = err == AuthProvider.invalidCredentialsMarker
          ? l10n.t('invalid_login_credentials')
          : (err ?? l10n.t('login_failed'));
      _showSnack(message, isError: true);
    }
    if (mounted) setState(() => _submitting = false);
  }

  void _showSnack(String message, {bool isError = false}) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? const Color(0xFFFF4757) : const Color(0xFF00D4AA),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  Widget _privacyCheckboxTile(AppLocalizations l10n) {
    return InkWell(
      onTap: () => setState(() => _agreedToTerms = !_agreedToTerms),
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 24,
              height: 24,
              child: Checkbox(
                value: _agreedToTerms,
                onChanged: (v) => setState(() => _agreedToTerms = v ?? false),
                activeColor: const Color(0xFF6C63FF),
                fillColor: WidgetStateProperty.resolveWith(
                    (_) => _agreedToTerms ? const Color(0xFF6C63FF) : Colors.transparent),
                side: BorderSide(color: Colors.white.withAlpha(100)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Wrap(
                children: [
                  Text(
                    l10n.t('privacy_agree'),
                    style: TextStyle(
                        color: Colors.white.withAlpha(220), fontSize: 13, height: 1.4),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const PrivacyPolicyScreen()),
                    ),
                    child: Text(
                      ' ${l10n.t('privacy_view_full')}',
                      style: const TextStyle(
                        color: Color(0xFF6C63FF),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _requestForgotCode() async {
    final u = _forgotUsername.trim();
    if (u.isEmpty || _forgotResendCooldown > 0) return;
    setState(() {
      _forgotSending = true;
      _forgotInlineMsg = null;
      _forgotInlineIsErr = false;
    });
    _notifyForgotSheet();
    try {
      final api = context.read<ApiService>();
      final res = await api.post(ApiConfig.forgotPassword, body: {'usernameOrEmail': u});
      if (mounted) {
        final l10n = AppLocalizations.of(context);
        if (res['success'] == true) {
          setState(() {
            _forgotInlineMsg = l10n.t('code_sent');
            _forgotInlineIsErr = false;
          });
          _startForgotResendCooldown();
        } else {
          setState(() {
            _forgotInlineMsg = (res['message'] ?? 'Failed').toString();
            _forgotInlineIsErr = true;
          });
          _notifyForgotSheet();
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _forgotInlineMsg = 'Network error';
          _forgotInlineIsErr = true;
        });
        _notifyForgotSheet();
      }
    }
    if (mounted) {
      setState(() => _forgotSending = false);
      _notifyForgotSheet();
    }
  }

  void _showForgotFlow(BuildContext context, AppLocalizations l10n) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => AnimatedPadding(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: EdgeInsets.only(bottom: MediaQuery.of(sheetCtx).viewInsets.bottom),
        child: StatefulBuilder(
          builder: (_, setModalState) {
          _forgotSheetRedraw = () => setModalState(() {});

          return DraggableScrollableSheet(
            initialChildSize: 0.55,
            minChildSize: 0.35,
            maxChildSize: 0.92,
            builder: (_, sc) => Container(
              decoration: BoxDecoration(
                color: const Color(0xFF0A0A1F),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                border: Border.all(color: Colors.white.withAlpha(15)),
              ),
              padding: const EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 16),
              child: ListView(
                controller: sc,
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                children: [
                  Text(l10n.t('forgot_password'), style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Text(l10n.t('forgot_password_hint'), style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 13)),
                  const SizedBox(height: 14),
                  TextField(
                    onChanged: (v) {
                      setState(() {
                        _forgotUsername = v;
                        _forgotInlineMsg = null;
                      });
                      setModalState(() {});
                    },
                    scrollPadding: const EdgeInsets.only(bottom: 32),
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: '${l10n.t('login_username')} / Email',
                      hintStyle: const TextStyle(color: Color(0xFF4B5563)),
                      filled: true,
                      fillColor: const Color(0xFF12122A),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    onChanged: (v) {
                      setState(() {
                        _forgotCode = v;
                        _forgotInlineMsg = null;
                      });
                      setModalState(() {});
                    },
                    scrollPadding: const EdgeInsets.only(bottom: 32),
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: l10n.t('reg_code_placeholder'),
                      hintStyle: const TextStyle(color: Color(0xFF4B5563)),
                      filled: true,
                      fillColor: const Color(0xFF12122A),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  if (_forgotInlineMsg != null) ...[
                    const SizedBox(height: 16),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: (_forgotInlineIsErr ? const Color(0xFFFF4757) : const Color(0xFF00D4AA)).withAlpha(35),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: (_forgotInlineIsErr ? const Color(0xFFFF4757) : const Color(0xFF00D4AA)).withAlpha(120),
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        child: Text(
                          _forgotInlineMsg!,
                          style: TextStyle(
                            color: _forgotInlineIsErr ? const Color(0xFFFF9494) : const Color(0xFF92F5DC),
                            fontSize: 14,
                            height: 1.35,
                          ),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: (_forgotSending || _forgotResendCooldown > 0) ? null : _requestForgotCode,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF6C63FF),
                            foregroundColor: Colors.white,
                            disabledForegroundColor: Colors.white.withAlpha(160),
                          ),
                          child: _forgotSending
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : Text(
                                  _forgotResendCooldown > 0 ? '${l10n.t('send_code')} (${_forgotResendCooldown}s)' : l10n.t('send_code'),
                                  textAlign: TextAlign.center,
                                ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _forgotVerifying || _forgotCode.replaceAll(RegExp(r'\D'), '').length != 6
                              ? null
                              : () => _resetPassword(sheetCtx),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF00D4AA),
                            foregroundColor: Colors.white,
                            disabledForegroundColor: Colors.white.withAlpha(160),
                          ),
                          child: _forgotVerifying ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : Text(l10n.t('reset_password')),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => Navigator.of(sheetCtx).pop(),
                    child: Text('← ${l10n.t('cancel')}', style: TextStyle(color: Colors.white.withAlpha(150))),
                  ),
                ],
              ),
            ),
          );
          },
        ),
      ),
    ).whenComplete(() {
      _forgotSheetRedraw = null;
      if (mounted) {
        setState(() {
          _forgotInlineMsg = null;
          _forgotInlineIsErr = false;
        });
      }
    });
  }

  Future<void> _resetPassword(BuildContext sheetCtx) async {
    final u = _forgotUsername.trim();
    final c = _forgotCode.replaceAll(RegExp(r'\D'), '');
    if (u.isEmpty || c.length != 6) return;
    final l10n = AppLocalizations.of(context);
    setState(() => _forgotVerifying = true);
    _notifyForgotSheet();
    try {
      final api = context.read<ApiService>();
      final res = await api.post(ApiConfig.resetPassword, body: {
        'usernameOrEmail': u,
        'code': c,
      });
      if (!mounted || !sheetCtx.mounted) return;
      if (res['success'] == true) {
        Navigator.of(sheetCtx).pop();
        _showSnack(l10n.t('password_recovery_email_sent'));
        setState(() {
          _forgotUsername = '';
          _forgotCode = '';
        });
      } else {
        setState(() {
          _forgotInlineMsg = (res['message'] ?? l10n.t('invalid_code')).toString();
          _forgotInlineIsErr = true;
        });
        _notifyForgotSheet();
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _forgotInlineMsg = 'Network error';
          _forgotInlineIsErr = true;
        });
        _notifyForgotSheet();
      }
    }
    if (mounted) {
      setState(() => _forgotVerifying = false);
      _notifyForgotSheet();
    }
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    _logoCtrl.dispose();
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    _phoneOtpCtrl.dispose();
    _otpCodeCtrl.dispose();
    _regNameCtrl.dispose();
    _regPhoneCtrl.dispose();
    _regCompanyCtrl.dispose();
    _forgotCooldownTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final mq = MediaQuery.of(context);
    final kbOpen = mq.viewInsets.bottom > 0;
    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: const Color(0xFF05051A),
      body: Stack(
        children: [
          // Gradient orbs
          Positioned(
            top: -80,
            right: -60,
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF6C63FF).withAlpha(60),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: -100,
            left: -80,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF00D4AA).withAlpha(40),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.topCenter,
              child: SingleChildScrollView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: EdgeInsets.only(
                  left: 24,
                  right: 24,
                  top: kbOpen ? 8 : 16,
                  // Scaffold already shrinks with keyboard; only add safe-area inset (no duplicate viewInsets).
                  bottom: 12 + mq.padding.bottom,
                ),
                child: FadeTransition(
                  opacity: _fadeIn,
                  child: SlideTransition(
                    position: _slideUp,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AnimatedBuilder(
                          animation: _logoCtrl,
                          builder: (context, child) {
                            final logoSize = kbOpen ? 72.0 : 98.0;
                            return Transform.rotate(
                              angle: _logoRotate.value,
                              child: Transform.scale(
                                scale: _logoScale.value,
                                child: Container(
                                  width: logoSize,
                                  height: logoSize,
                                  padding: EdgeInsets.all(kbOpen ? 3 : 4),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(30),
                                    gradient: const LinearGradient(
                                      colors: [Color(0xFF6C63FF), Color(0xFF00D4AA)],
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: const Color(0xFF6C63FF).withAlpha(120),
                                        blurRadius: _logoGlow.value,
                                        spreadRadius: 2,
                                      ),
                                    ],
                                  ),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(26),
                                    child: Stack(
                                      fit: StackFit.expand,
                                      children: [
                                        Image.asset('assets/provisor_icon.png', fit: BoxFit.cover),
                                        Container(
                                          decoration: BoxDecoration(
                                            gradient: LinearGradient(
                                              colors: [
                                                Colors.white.withAlpha(24),
                                                Colors.transparent,
                                                Colors.black.withAlpha(20),
                                              ],
                                              begin: Alignment.topLeft,
                                              end: Alignment.bottomRight,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                        SizedBox(height: kbOpen ? 12 : 28),
                        ShaderMask(
                          shaderCallback: (bounds) => const LinearGradient(
                            colors: [
                              Color(0xFF6C63FF),
                              Color(0xFF00D4AA),
                            ],
                          ).createShader(bounds),
                          child: Text(
                            'PROVISOR',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: kbOpen ? 24 : 30,
                              fontWeight: FontWeight.w800,
                              letterSpacing: kbOpen ? 3 : 4,
                            ),
                          ),
                        ),
                        SizedBox(height: kbOpen ? 4 : 8),
                        Text(
                          l10n.t('app_subtitle'),
                          style: TextStyle(
                            color: Color(0xFF6B7280),
                            fontSize: 14,
                            letterSpacing: 0.5,
                          ),
                        ),
                        SizedBox(height: kbOpen ? 20 : 48),

                        // Glass card
                        ClipRRect(
                          borderRadius: BorderRadius.circular(24),
                          child: BackdropFilter(
                            filter:
                                ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                            child: Container(
                              padding: EdgeInsets.all(kbOpen ? 18 : 24),
                              decoration: BoxDecoration(
                                color: Colors.white.withAlpha(8),
                                borderRadius: BorderRadius.circular(24),
                                border: Border.all(
                                    color: Colors.white.withAlpha(15)),
                              ),
                              child: Column(
                                children: [
                                  Align(
                                    alignment: Alignment.centerLeft,
                                    child: TextButton(
                                      onPressed: () => setState(() {
                                        _usePasswordLogin = !_usePasswordLogin;
                                        _otpSent = false;
                                        _showSignupFields = false;
                                      }),
                                      style: TextButton.styleFrom(
                                        foregroundColor: const Color(0xFF9CA3AF),
                                        padding: EdgeInsets.zero,
                                        minimumSize: Size.zero,
                                        tapTargetSize:
                                            MaterialTapTargetSize.shrinkWrap,
                                      ),
                                      child: Text(
                                        _usePasswordLogin
                                            ? l10n.t('login_use_email_otp')
                                            : l10n.t('login_use_password'),
                                        style: const TextStyle(fontSize: 13),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  if (_usePasswordLogin) ...[
                                    _buildField(
                                      controller: _usernameCtrl,
                                      hint: l10n.t('login_username'),
                                      icon: Icons.person_outline_rounded,
                                    ),
                                    const SizedBox(height: 16),
                                    _buildField(
                                      controller: _passwordCtrl,
                                      hint: l10n.t('login_password'),
                                      icon: Icons.lock_outline_rounded,
                                      obscure: _obscure,
                                      suffix: IconButton(
                                        icon: Icon(
                                          _obscure
                                              ? Icons.visibility_off_outlined
                                              : Icons.visibility_outlined,
                                          color: const Color(0xFF6B7280),
                                          size: 20,
                                        ),
                                        onPressed: () =>
                                            setState(() => _obscure = !_obscure),
                                      ),
                                    ),
                                  ] else ...[
                                    _buildField(
                                      controller: _phoneOtpCtrl,
                                      hint: l10n.t('signup_phone'),
                                      icon: Icons.phone_android_outlined,
                                      keyboardType: TextInputType.phone,
                                    ),
                                    const SizedBox(height: 16),
                                    _privacyCheckboxTile(l10n),
                                    const SizedBox(height: 12),
                                    SizedBox(
                                      width: double.infinity,
                                      height: 50,
                                      child: OutlinedButton(
                                        onPressed: (_otpSendLoading || !_agreedToTerms)
                                            ? null
                                            : () => _sendPhoneOtp(l10n),
                                        style: OutlinedButton.styleFrom(
                                          foregroundColor: Colors.white,
                                          side: BorderSide(
                                              color: Colors.white.withAlpha(60)),
                                          shape: RoundedRectangleBorder(
                                            borderRadius:
                                                BorderRadius.circular(16),
                                          ),
                                        ),
                                        child: _otpSendLoading
                                            ? const SizedBox(
                                                width: 22,
                                                height: 22,
                                                child:
                                                    CircularProgressIndicator(
                                                  strokeWidth: 2.5,
                                                  color: Colors.white,
                                                ),
                                              )
                                            : Text(
                                                l10n.t('login_send_otp'),
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                      ),
                                    ),
                                    if (_otpSent) ...[
                                      const SizedBox(height: 16),
                                      _buildField(
                                        controller: _otpCodeCtrl,
                                        hint: l10n.t('login_otp_hint'),
                                        icon: Icons.pin_outlined,
                                        keyboardType: TextInputType.number,
                                        onSubmitted: (_) =>
                                            _showSignupFields
                                                ? _submitOtpRegister(l10n)
                                                : _submitOtpLogin(l10n),
                                      ),
                                      const SizedBox(height: 8),
                                      TextButton(
                                        onPressed: () => setState(() {
                                          _showSignupFields = !_showSignupFields;
                                        }),
                                        style: TextButton.styleFrom(
                                          foregroundColor:
                                              const Color(0xFF6C63FF),
                                          padding: EdgeInsets.zero,
                                          minimumSize: Size.zero,
                                          tapTargetSize:
                                              MaterialTapTargetSize.shrinkWrap,
                                        ),
                                        child: Text(
                                          l10n.t('signup_expand'),
                                          style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                      ),
                                      if (_showSignupFields) ...[
                                        const SizedBox(height: 8),
                                        _buildField(
                                          controller: _regNameCtrl,
                                          hint: l10n.t('signup_name'),
                                          icon: Icons.badge_outlined,
                                        ),
                                        const SizedBox(height: 12),
                                        _buildField(
                                          controller: _regPhoneCtrl,
                                          hint: l10n.t('signup_phone'),
                                          icon: Icons.phone_android_outlined,
                                          keyboardType: TextInputType.phone,
                                        ),
                                        const SizedBox(height: 12),
                                        Align(
                                          alignment: Alignment.centerLeft,
                                          child: Text(
                                            l10n.t('signup_role'),
                                            style: TextStyle(
                                              color:
                                                  Colors.white.withAlpha(200),
                                              fontSize: 13,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          l10n.t('signup_role_pick'),
                                          style: TextStyle(
                                            color: Colors.white.withAlpha(140),
                                            fontSize: 12,
                                            height: 1.3,
                                          ),
                                        ),
                                        const SizedBox(height: 8),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 12),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFF12122A),
                                            borderRadius:
                                                BorderRadius.circular(14),
                                            border: Border.all(
                                                color:
                                                    Colors.white.withAlpha(15)),
                                          ),
                                          child: DropdownButtonHideUnderline(
                                            child: DropdownButton<String>(
                                              value: _signupRole,
                                              isExpanded: true,
                                              dropdownColor:
                                                  const Color(0xFF1a1a2e),
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 15,
                                              ),
                                              items: const [
                                                'COMPANY',
                                                'ENGINEER',
                                                'TECHNICIAN',
                                                'PERSONAL',
                                                'WORKER',
                                              ]
                                                  .map(
                                                    (r) =>
                                                        DropdownMenuItem(
                                                      value: r,
                                                      child: Text(
                                                          _signupRoleLabel(
                                                              l10n, r)),
                                                    ),
                                                  )
                                                  .toList(),
                                              onChanged: (v) {
                                                if (v != null) {
                                                  setState(() =>
                                                      _signupRole = v);
                                                }
                                              },
                                            ),
                                          ),
                                        ),
                                        const SizedBox(height: 8),
                                        Text(
                                          l10n.t(_signupRoleHintKey(_signupRole)),
                                          style: TextStyle(
                                            color:
                                                Colors.white.withAlpha(120),
                                            fontSize: 11,
                                            height: 1.35,
                                          ),
                                        ),
                                        const SizedBox(height: 12),
                                        Align(
                                          alignment: Alignment.centerLeft,
                                          child: Text(
                                            l10n.t('signup_province_optional'),
                                            style: TextStyle(
                                              color:
                                                  Colors.white.withAlpha(180),
                                              fontSize: 12,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(height: 6),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 12),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFF12122A),
                                            borderRadius:
                                                BorderRadius.circular(14),
                                            border: Border.all(
                                                color:
                                                    Colors.white.withAlpha(15)),
                                          ),
                                          child: DropdownButtonHideUnderline(
                                            child: DropdownButton<String?>(
                                              value: _signupProvince,
                                              hint: Text(
                                                l10n.t(
                                                    'province_optional_none'),
                                                style: TextStyle(
                                                  color: Colors.white
                                                      .withAlpha(140),
                                                  fontSize: 15,
                                                ),
                                              ),
                                              isExpanded: true,
                                              dropdownColor:
                                                  const Color(0xFF1a1a2e),
                                              iconEnabledColor:
                                                  Colors.white.withAlpha(180),
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 15,
                                              ),
                                              items: [
                                                DropdownMenuItem<String?>(
                                                  value: null,
                                                  child: Text(
                                                    l10n.t(
                                                        'province_optional_none'),
                                                  ),
                                                ),
                                                ...iraqProvinces.map(
                                                  (p) =>
                                                      DropdownMenuItem<String?>(
                                                    value: p,
                                                    child: Text(p),
                                                  ),
                                                ),
                                              ],
                                              onChanged: (v) => setState(
                                                  () => _signupProvince = v),
                                            ),
                                          ),
                                        ),
                                        const SizedBox(height: 12),
                                        _buildField(
                                          controller: _regCompanyCtrl,
                                          hint:
                                              l10n.t('signup_company_optional'),
                                          icon: Icons.business_outlined,
                                        ),
                                      ],
                                      const SizedBox(height: 16),
                                      SizedBox(
                                        width: double.infinity,
                                        height: 54,
                                        child: DecoratedBox(
                                          decoration: BoxDecoration(
                                            gradient: const LinearGradient(
                                              colors: [
                                                Color(0xFF6C63FF),
                                                Color(0xFF5A52E0),
                                              ],
                                            ),
                                            borderRadius:
                                                BorderRadius.circular(16),
                                            boxShadow: [
                                              BoxShadow(
                                                color: const Color(0xFF6C63FF)
                                                    .withAlpha(80),
                                                blurRadius: 20,
                                                offset: const Offset(0, 6),
                                              ),
                                            ],
                                          ),
                                          child: ElevatedButton(
                                            onPressed:
                                                (_otpVerifyLoading ||
                                                        !_agreedToTerms)
                                                    ? null
                                                    : (_showSignupFields
                                                        ? () =>
                                                            _submitOtpRegister(
                                                                l10n)
                                                        : () =>
                                                            _submitOtpLogin(
                                                                l10n)),
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor:
                                                  Colors.transparent,
                                              shadowColor:
                                                  Colors.transparent,
                                              foregroundColor: Colors.white,
                                              shape: RoundedRectangleBorder(
                                                borderRadius:
                                                    BorderRadius.circular(16),
                                              ),
                                            ),
                                            child: _otpVerifyLoading
                                                ? const SizedBox(
                                                    width: 22,
                                                    height: 22,
                                                    child:
                                                        CircularProgressIndicator(
                                                      strokeWidth: 2.5,
                                                      color: Colors.white,
                                                    ),
                                                  )
                                                : Text(
                                                    _showSignupFields
                                                        ? l10n
                                                            .t('signup_submit')
                                                        : l10n.t(
                                                            'login_verify_sign_in'),
                                                    style: const TextStyle(
                                                      fontSize: 16,
                                                      fontWeight:
                                                          FontWeight.w700,
                                                      letterSpacing: 0.5,
                                                    ),
                                                  ),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ],
                                  if (_usePasswordLogin) ...[
                                    const SizedBox(height: 16),
                                    _privacyCheckboxTile(l10n),
                                    const SizedBox(height: 16),
                                    SizedBox(
                                      width: double.infinity,
                                      height: 54,
                                      child: DecoratedBox(
                                        decoration: BoxDecoration(
                                          gradient: const LinearGradient(
                                            colors: [
                                              Color(0xFF6C63FF),
                                              Color(0xFF5A52E0),
                                            ],
                                          ),
                                          borderRadius:
                                              BorderRadius.circular(16),
                                          boxShadow: [
                                            BoxShadow(
                                              color: const Color(0xFF6C63FF)
                                                  .withAlpha(80),
                                              blurRadius: 20,
                                              offset: const Offset(0, 6),
                                            ),
                                          ],
                                        ),
                                        child: ElevatedButton(
                                          onPressed: (_submitting ||
                                                  !_agreedToTerms)
                                              ? null
                                              : _login,
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor:
                                                Colors.transparent,
                                            shadowColor: Colors.transparent,
                                            foregroundColor: Colors.white,
                                            shape: RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.circular(16),
                                            ),
                                          ),
                                          child: _submitting
                                              ? const SizedBox(
                                                  width: 22,
                                                  height: 22,
                                                  child:
                                                      CircularProgressIndicator(
                                                    strokeWidth: 2.5,
                                                    color: Colors.white,
                                                  ),
                                                )
                                              : Text(
                                                  l10n.t('login_sign_in'),
                                                  style: const TextStyle(
                                                    fontSize: 16,
                                                    fontWeight: FontWeight.w700,
                                                    letterSpacing: 0.5,
                                                  ),
                                                ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    LayoutBuilder(
                                      builder: (context, constraints) {
                                        final narrow =
                                            constraints.maxWidth < 300;
                                        return Wrap(
                                          alignment:
                                              WrapAlignment.spaceBetween,
                                          runSpacing: 4,
                                          children: [
                                            TextButton(
                                              onPressed: () =>
                                                  _showForgotFlow(
                                                      context, l10n),
                                              style: TextButton.styleFrom(
                                                foregroundColor:
                                                    const Color(0xFF6C63FF),
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        horizontal: 8,
                                                        vertical: 4),
                                                minimumSize: Size.zero,
                                                tapTargetSize:
                                                    MaterialTapTargetSize
                                                        .shrinkWrap,
                                              ),
                                              child: Text(
                                                l10n.t('forgot_password'),
                                                style: TextStyle(
                                                    fontSize:
                                                        narrow ? 12 : 13),
                                              ),
                                            ),
                                            TextButton(
                                              onPressed: () =>
                                                  showRegistrationRequestModal(
                                                      context),
                                              style: TextButton.styleFrom(
                                                foregroundColor:
                                                    const Color(0xFF6C63FF),
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        horizontal: 8,
                                                        vertical: 4),
                                                minimumSize: Size.zero,
                                                tapTargetSize:
                                                    MaterialTapTargetSize
                                                        .shrinkWrap,
                                              ),
                                              child: Text(
                                                l10n.t(
                                                    'registration_request_tertiary'),
                                                style: TextStyle(
                                                  fontSize: narrow ? 11 : 12,
                                                  fontWeight: FontWeight.w400,
                                                ),
                                                maxLines: 2,
                                                overflow:
                                                    TextOverflow.ellipsis,
                                              ),
                                            ),
                                          ],
                                        );
                                      },
                                    ),
                                  ] else ...[
                                    const SizedBox(height: 8),
                                    Center(
                                      child: TextButton(
                                        onPressed: () =>
                                            showRegistrationRequestModal(
                                                context),
                                        style: TextButton.styleFrom(
                                          foregroundColor: const Color(0xFF6B7280),
                                          minimumSize: Size.zero,
                                          tapTargetSize:
                                              MaterialTapTargetSize.shrinkWrap,
                                        ),
                                        child: Text(
                                          l10n.t('registration_request_tertiary'),
                                          style: const TextStyle(fontSize: 11),
                                          textAlign: TextAlign.center,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildField({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    bool obscure = false,
    Widget? suffix,
    TextInputType keyboardType = TextInputType.text,
    void Function(String)? onSubmitted,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      scrollPadding: const EdgeInsets.only(bottom: 40),
      style: const TextStyle(color: Colors.white, fontSize: 15),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Color(0xFF4B5563)),
        prefixIcon: Icon(icon, color: const Color(0xFF6C63FF), size: 20),
        suffixIcon: suffix,
        filled: true,
        fillColor: const Color(0xFF12122A),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Colors.white.withAlpha(15)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFF6C63FF), width: 1.5),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      textInputAction: onSubmitted != null
          ? TextInputAction.done
          : (suffix != null ? TextInputAction.done : TextInputAction.next),
      onSubmitted: onSubmitted ??
          (suffix != null ? (_) => _login() : null),
    );
  }
}
