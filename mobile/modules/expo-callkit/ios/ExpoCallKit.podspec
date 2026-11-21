Pod::Spec.new do |s|
  s.name           = 'ExpoCallKit'
  s.version        = '1.0.0'
  s.summary        = 'CallKit и PushKit (VoIP) для входящих звонков при закрытом приложении'
  s.description    = 'Показывает системный экран входящего звонка по VoIP-пушу и передаёт ответ/сброс в JavaScript.'
  s.license        = 'MIT'
  s.author         = 'Источник жизни'
  s.homepage       = 'https://example.invalid'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'CallKit', 'PushKit', 'AVFoundation'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = '**/*.{h,m,swift}'
end
