import 'dart:collection';
import 'dart:io';

import 'package:image/image.dart' as img;

void main() {
  const sourcePath =
      '/Users/vl4endev/.cursor/projects/Users-vl4endev/assets/Gemini_Generated_Image_pra00bpra00bpra0-4f6c1be5-29fe-4ede-8d54-4488c780778e.png';
  const outputPath = '/Users/vl4endev/истчоник жизни/assets/logo_primary.png';

  final sourceBytes = File(sourcePath).readAsBytesSync();
  final decoded = img.decodeImage(sourceBytes);
  if (decoded == null) {
    stderr.writeln('Unable to decode source image');
    exitCode = 1;
    return;
  }

  final image = img.Image.from(decoded);
  final width = image.width;
  final height = image.height;
  final visited = List.generate(height, (_) => List<bool>.filled(width, false));
  final queue = Queue<(int x, int y)>();

  bool isBackground(img.Pixel px) {
    final a = px.a.toInt();
    final r = px.r.toInt();
    final g = px.g.toInt();
    final b = px.b.toInt();
    if (a == 0) {
      return true;
    }
    final nearBlack = r <= 28 && g <= 28 && b <= 28;
    final nearWhite =
        r >= 244 && g >= 244 && b >= 244 && (r - g).abs() <= 10 && (g - b).abs() <= 10;
    return nearBlack || nearWhite;
  }

  void enqueue(int x, int y) {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    if (visited[y][x]) {
      return;
    }
    visited[y][x] = true;
    queue.add((x, y));
  }

  for (var x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (var y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queue.isNotEmpty) {
    final current = queue.removeFirst();
    final x = current.$1;
    final y = current.$2;
    final pixel = image.getPixel(x, y);
    if (!isBackground(pixel)) {
      continue;
    }

    image.setPixelRgba(x, y, pixel.r.toInt(), pixel.g.toInt(), pixel.b.toInt(), 0);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  final trimmed = img.trim(image) ?? image;
  final maxSide = 768;
  final resized = (trimmed.width > maxSide || trimmed.height > maxSide)
      ? img.copyResize(
          trimmed,
          width: trimmed.width >= trimmed.height ? maxSide : null,
          height: trimmed.height > trimmed.width ? maxSide : null,
          interpolation: img.Interpolation.cubic,
        )
      : trimmed;

  final outBytes = img.encodePng(resized, level: 6);
  File(outputPath).writeAsBytesSync(outBytes);
  stdout.writeln('Saved $outputPath (${resized.width}x${resized.height})');
}
