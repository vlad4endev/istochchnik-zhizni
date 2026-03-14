import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../project/project_branding_provider.dart';

/// Логотип приложения с поддержкой бренд-настроек.
class AppLogo extends ConsumerWidget {
  const AppLogo({
    super.key,
    this.size = 40,
    this.fallbackIcon,
    this.fallbackIconColor,
  });

  final double size;
  final IconData? fallbackIcon;
  final Color? fallbackIconColor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branding = ref.watch(projectBrandingValueProvider);
    final customDataUrl = branding.customLogoDataUrl;
    final scale = branding.logoScalePercent.clamp(80, 160) / 100.0;
    final logoAssetPath = branding.logoAssetPath.trim();
    final isSvgAsset = logoAssetPath.toLowerCase().endsWith('.svg');

    final logoWidget = customDataUrl != null && customDataUrl.isNotEmpty
        ? _buildCustomLogo(customDataUrl)
        : isSvgAsset
        ? SvgPicture.asset(
            logoAssetPath,
            fit: BoxFit.contain,
            placeholderBuilder: (_) => _fallbackIcon(),
          )
        : Image.asset(
            logoAssetPath,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => _fallbackIcon(),
          );

    return SizedBox(
      width: size,
      height: size,
      child: ClipRect(
        child: Center(
          child: Transform.scale(
            scale: scale,
            child: SizedBox(width: size, height: size, child: logoWidget),
          ),
        ),
      ),
    );
  }

  Widget _buildCustomLogo(String dataUrl) {
    try {
      final split = dataUrl.split(',');
      if (split.length != 2) {
        return _fallbackIcon();
      }
      final meta = split.first;
      final payload = split.last;
      final bytes = base64Decode(payload);
      if (meta.contains('image/svg+xml')) {
        final svgText = utf8.decode(bytes, allowMalformed: true);
        return SvgPicture.string(
          svgText,
          fit: BoxFit.contain,
          placeholderBuilder: (_) => _fallbackIcon(),
        );
      }
      return Image.memory(
        bytes,
        fit: BoxFit.contain,
        gaplessPlayback: true,
        errorBuilder: (_, error, stackTrace) => _fallbackIcon(),
      );
    } catch (_) {
      return _fallbackIcon();
    }
  }

  Widget _fallbackIcon() {
    try {
      if (fallbackIcon != null) {
        return Icon(fallbackIcon, size: size * 0.6, color: fallbackIconColor);
      }
      return const SizedBox.shrink();
    } catch (_) {
      return const SizedBox.shrink();
    }
  }
}
