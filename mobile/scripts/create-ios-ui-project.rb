require "fileutils"
require "xcodeproj"

directory = File.expand_path(ARGV.fetch(0))
FileUtils.mkdir_p(directory)
project = Xcodeproj::Project.new(File.join(directory, "WritingSafety.xcodeproj"))
target = project.new_target(:ui_test_bundle, "WritingSafetyUI", :ios, "17.0")
source = project.main_group.new_file(File.expand_path("../e2e/WritingSafetyTests.swift", __dir__))
target.source_build_phase.add_file_reference(source)
target.build_configurations.each do |configuration|
  configuration.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] = "dev.notesagain.writing-safety-ui"
  configuration.build_settings["GENERATE_INFOPLIST_FILE"] = "YES"
  configuration.build_settings["SWIFT_VERSION"] = "5.0"
  configuration.build_settings["TARGETED_DEVICE_FAMILY"] = "1"
  configuration.build_settings["CODE_SIGNING_ALLOWED"] = "NO"
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.add_test_target(target)
scheme.save_as(project.path, "WritingSafety", true)
puts project.path
