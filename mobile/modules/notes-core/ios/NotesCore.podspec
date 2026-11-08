Pod::Spec.new do |s|
  s.name           = 'NotesCore'
  s.version        = '1.0.0'
  s.summary        = 'The Notes Again server, running inside the app'
  s.description    = 'Links the Rust notes-again-server crate so the app keeps its own database and syncs like the desktop app.'
  s.author         = ''
  s.homepage       = 'https://github.com/saisandeepvaddi/notes-again'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.vendored_frameworks = 'NotesAgainCore.xcframework'
  s.frameworks = 'Security', 'SystemConfiguration'
  s.libraries = 'c++'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '*.swift'
end
