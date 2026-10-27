require 'xcodeproj'
require 'fileutils'

dir = File.expand_path(ARGV.fetch(0))
FileUtils.mkdir_p(dir)
FileUtils.cp(File.join(__dir__, 'ProductFlow.swift'), dir)
project = Xcodeproj::Project.new(File.join(dir, 'LevelUpProductQA.xcodeproj'))
target = project.new_target(:ui_test_bundle, 'LevelUpProductQA', :ios, '15.1')
target.build_configurations.each do |configuration|
  configuration.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.levelup.productqa',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'SWIFT_VERSION' => '5.0',
    'CODE_SIGNING_ALLOWED' => 'NO',
    'TARGETED_DEVICE_FAMILY' => '1,2'
  })
end
target.add_file_references([project.main_group.new_file('ProductFlow.swift')])
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.add_test_target(target)
scheme.save_as(project.path, 'LevelUpProductQA', true)
