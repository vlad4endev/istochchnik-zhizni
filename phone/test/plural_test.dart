import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/plural.dart';

void main() {
  test('склонение «песня»', () {
    expect(countSongs(0), '0 песен');
    expect(countSongs(1), '1 песня');
    expect(countSongs(2), '2 песни');
    expect(countSongs(5), '5 песен');
    expect(countSongs(11), '11 песен');
    expect(countSongs(12), '12 песен');
    expect(countSongs(21), '21 песня');
    expect(countSongs(22), '22 песни');
    expect(countSongs(120), '120 песен');
    expect(countSongs(111), '111 песен');
  });
}
