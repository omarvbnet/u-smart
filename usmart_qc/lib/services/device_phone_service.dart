import 'dart:io';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

/// Attempts to get the device phone number (Android only; iOS returns null).
class DevicePhoneService {
  static const _channel = MethodChannel('com.usmart.usmart_qc/device_phone');

  /// Returns the SIM phone number if available, or null.
  /// Android: Requests READ_PHONE_STATE/READ_PHONE_NUMBERS, then fetches number.
  /// iOS: Not supported by Apple - returns null.
  static Future<String?> getDevicePhoneNumber() async {
    if (!Platform.isAndroid) return null;
    try {
      final status = await Permission.phone.status;
      if (!status.isGranted) {
        final result = await Permission.phone.request();
        if (!result.isGranted) return null;
      }
      final String? number = await _channel.invokeMethod<String>('getPhoneNumber');
      if (number == null || number.trim().isEmpty) return null;
      return number.trim();
    } on PlatformException {
      return null;
    } catch (_) {
      return null;
    }
  }
}
