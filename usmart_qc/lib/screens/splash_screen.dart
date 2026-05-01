import 'package:flutter/material.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _logoScale;
  late final Animation<double> _logoRotate;
  late final Animation<double> _glowOpacity;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat(reverse: true);
    _logoScale = Tween<double>(begin: 0.94, end: 1.05).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOutSine),
    );
    _logoRotate = Tween<double>(begin: -0.02, end: 0.02).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
    _glowOpacity = Tween<double>(begin: 0.25, end: 0.7).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOutCubic),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      body: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return Stack(
            children: [
              Positioned(
                top: -120,
                right: -80,
                child: Container(
                  width: 320,
                  height: 320,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        const Color(0xFF6C63FF).withValues(alpha: 0.35),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                bottom: -110,
                left: -70,
                child: Container(
                  width: 280,
                  height: 280,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        const Color(0xFF00D4AA).withValues(alpha: 0.22),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 130,
                      height: 130,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF6C63FF)
                                .withValues(alpha: _glowOpacity.value),
                            blurRadius: 50,
                            spreadRadius: 6,
                          ),
                        ],
                      ),
                      child: Transform.rotate(
                        angle: _logoRotate.value,
                        child: Transform.scale(
                          scale: _logoScale.value,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(30),
                            child: Image.asset(
                              'assets/provisor_icon.png',
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 26),
                    const Text(
                      'PROVISER',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 3.2,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Quality Control Supervision',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.72),
                        fontSize: 13,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: 30),
                    const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: Color(0xFF6C63FF),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
