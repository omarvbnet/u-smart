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
  late final Animation<double> _pulse;
  late final Animation<double> _titleOpacity;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3600),
    )..repeat();
    _logoScale = Tween<double>(begin: 0.9, end: 1.07).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.6, curve: Curves.easeInOut)),
    );
    _logoRotate = Tween<double>(begin: -0.03, end: 0.03).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.45, curve: Curves.easeInOutSine)),
    );
    _pulse = Tween<double>(begin: 0.2, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.2, 1.0, curve: Curves.easeInOut)),
    );
    _titleOpacity = Tween<double>(begin: 0.55, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.35, 1.0, curve: Curves.easeInOut)),
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
          final wave = (0.5 - (_controller.value - 0.5).abs()) * 2;
          return Stack(
            children: [
              Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Color(0xFF05051A),
                      Color(0xFF0B1028),
                      Color(0xFF05051A),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
              ),
              _buildGlow(
                alignment: const Alignment(-1.1, -0.85),
                size: 320 + (40 * wave),
                color: const Color(0xFF6C63FF).withValues(alpha: 0.3),
              ),
              _buildGlow(
                alignment: const Alignment(1.05, -0.2),
                size: 250 + (30 * (1 - wave)),
                color: const Color(0xFF3BC7FF).withValues(alpha: 0.22),
              ),
              _buildGlow(
                alignment: const Alignment(-0.9, 0.95),
                size: 290 + (35 * wave),
                color: const Color(0xFF00D4AA).withValues(alpha: 0.24),
              ),
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 148,
                      height: 148,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(44),
                        gradient: LinearGradient(
                          colors: [
                            const Color(0xFF6C63FF).withValues(alpha: 0.24),
                            const Color(0xFF00D4AA).withValues(alpha: 0.1),
                          ],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.15),
                          width: 1.2,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF6C63FF).withValues(alpha: 0.28 + (_pulse.value * 0.22)),
                            blurRadius: 45,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: Transform.rotate(
                        angle: _logoRotate.value,
                        child: Transform.scale(
                          scale: _logoScale.value,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(32),
                            child: Image.asset(
                              'assets/provisor_icon.png',
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 30),
                    Opacity(
                      opacity: _titleOpacity.value,
                      child: const Text(
                        'PROVISER',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 29,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 3.4,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Quality Control Supervision',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.72 + (wave * 0.12)),
                        fontSize: 13,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: 34),
                    SizedBox(
                      width: 90,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: LinearProgressIndicator(
                          minHeight: 3.2,
                          value: wave,
                          backgroundColor: Colors.white.withValues(alpha: 0.12),
                          valueColor: const AlwaysStoppedAnimation(Color(0xFF6C63FF)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                bottom: 34,
                left: 0,
                right: 0,
                child: Opacity(
                  opacity: 0.78 + (0.2 * wave),
                  child: const Text(
                    'U SMART',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 4.0,
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildGlow({
    required Alignment alignment,
    required double size,
    required Color color,
  }) {
    return Align(
      alignment: alignment,
      child: IgnorePointer(
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [
                color,
                Colors.transparent,
              ],
            ),
          ),
        ),
      ),
    );
  }
}
