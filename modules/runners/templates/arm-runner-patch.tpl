# Patch for ARM64 (no ICU install by default)
yum install -y patch
patch -p1 <<ICU_PATCH
diff -Naur a/bin/Runner.Listener.runtimeconfig.json b/bin/Runner.Listener.runtimeconfig.json
--- a/bin/Runner.Listener.runtimeconfig.json	2020-07-01 02:21:09.000000000 +0000
+++ b/bin/Runner.Listener.runtimeconfig.json	2020-07-28 00:02:38.748868613 +0000
@@ -8,7 +8,8 @@
       }
     ],
     "configProperties": {
-      "System.Runtime.TieredCompilation.QuickJit": true
+      "System.Runtime.TieredCompilation.QuickJit": true,
+      "System.Globalization.Invariant": true
     }
   }
-}
\ No newline at end of file
+}
diff -Naur a/bin/Runner.PluginHost.runtimeconfig.json b/bin/Runner.PluginHost.runtimeconfig.json
--- a/bin/Runner.PluginHost.runtimeconfig.json	2020-07-01 02:21:22.000000000 +0000
+++ b/bin/Runner.PluginHost.runtimeconfig.json	2020-07-28 00:02:59.358680003 +0000
@@ -8,7 +8,8 @@
       }
     ],
     "configProperties": {
-      "System.Runtime.TieredCompilation.QuickJit": true
+      "System.Runtime.TieredCompilation.QuickJit": true,
+      "System.Globalization.Invariant": true
     }
   }
-}
\ No newline at end of file
+}
diff -Naur a/bin/Runner.Worker.runtimeconfig.json b/bin/Runner.Worker.runtimeconfig.json
--- a/bin/Runner.Worker.runtimeconfig.json	2020-07-01 02:21:16.000000000 +0000
+++ b/bin/Runner.Worker.runtimeconfig.json	2020-07-28 00:02:19.159028531 +0000
@@ -8,7 +8,8 @@
       }
     ],
     "configProperties": {
-      "System.Runtime.TieredCompilation.QuickJit": true
+      "System.Runtime.TieredCompilation.QuickJit": true,
+      "System.Globalization.Invariant": true
     }
   }
-}
\ No newline at end of file
+}
ICU_PATCH
