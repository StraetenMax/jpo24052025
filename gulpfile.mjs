import gulp from 'gulp';
import pug from 'gulp-pug';
import mjml from 'mjml';
import { minify as htmlmin } from 'html-minifier-terser';
import rename from 'gulp-rename';
import clean from 'gulp-clean';
import through2 from 'through2';
// import htmlhint from 'gulp-htmlhint';  // Commenté, à décommenter si nécessaire
import { load } from 'cheerio';
import liveServer from 'live-server';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
// import { mkdir } from 'fs/promises';  // Commenté car fs.mkdir est déjà importé ci-dessus

// Définit __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration simple pour MJML
const config = {
  mjmlOptions: {
    beautify: false, // Ne pas embellir le HTML généré
    minify: false,   // Ne pas minifier le HTML
    validationLevel: 'strict', //'soft', 'skip' Niveau de validation strict
    fonts: {}, // Configuration des polices
    keepComments: false, // Ne pas conserver les commentaires
    ignoreIncludes: true, // Ignorer les inclusions
    preprocessors: [], // Liste des préprocesseurs
    useMjmlConfigOptions: false, // Ne pas utiliser les options de configuration MJML
  }
};

// Tâche pour supprimer les attributs style
const removeEmptyStyles = () => {
  return through2.obj((file, _, cb) => {
    if (file.isBuffer()) {
      const $ = load(file.contents.toString());
      $('[style=""]').removeAttr('style'); // Supprimer les attributs style vides
      file.contents = Buffer.from($.html());
    }
    cb(null, file);
  });
};

// Assurez-vous que le répertoire 'dist' existe
const ensureDistDirectory = async () => {
  try {
    await fs.mkdir('./dist', { recursive: true });
    console.log('Directory "dist" created or already exists.');
  } catch (error) {
    console.error('Error creating directory "dist":', error);
  }
};

// Serveur
const serve = (done) => {
  const params = {
    port: 8080,
    root: path.resolve(__dirname, './dist'),
    open: true,
    file: 'index.html',
    wait: 500,
    logLevel: 2, // Niveau de journalisation (0 = désactivé, 1 = erreurs, 2 = infos, 3 = debogage)
  };
  try {
    liveServer.start(params);
    console.log('Live Server started on port', params.port);
  } catch (error) {
    console.error('Error starting Live Server:', error);
  }
  done();
};

// Nettoyage
const cleanDist = () => {
  return gulp.src('./dist', { allowEmpty: true, read: false })
    .pipe(clean());
};

// Pug vers Mjml
const pugToMjml = () => {
  return gulp.src('./src/*.pug')
    .pipe(pug({
      pretty: true, // À retirer pour la production
      debug: false, // À retirer pour la production
      compileDebug: false,
      globals: [],
      self: false,
    }))
    .pipe(rename({ extname: '.mjml' }))
    .pipe(gulp.dest('./src/mjml'));
};

// Mjml vers HTML
const mjmlToHtml = () => {
  return gulp.src('./src/mjml/*.mjml')
    .pipe(through2.obj((file, _, cb) => {
      try {
        const mjmlContent = file.contents.toString();
        // Utilise la configuration définie plus haut
        const mjmlConfig = {
          ...config.mjmlOptions,
          filePath: file.path // Ajout du chemin du fichier pour les imports relatifs
        };
        
        const result = mjml(mjmlContent, mjmlConfig);
        
        if (result.errors && result.errors.length) {
          console.error('MJML Errors:', result.errors);
          return cb(new Error('MJML compilation failed'));
        }
        
        file.contents = Buffer.from(result.html);
        cb(null, file);
      } catch (error) {
        console.error('Erreur dans le fichier:', file.path);
        console.error(error.message);
        cb(error);
      }
    }))
    .pipe(rename({ extname: '.html' }))
    .pipe(removeEmptyStyles())
    .pipe(gulp.dest('./dist'));
};

// Minification HTML
const minifyHtml = () => {
  return new Promise((resolve) => {
    // Petit délai pour s'assurer que les fichiers sont bien créés
    setTimeout(() => {
      console.log('Starting minifyHtml task...');
      gulp.src(['./dist/*.html', '!./dist/*.min.html'])
        .pipe(through2.obj(async (file, enc, callback) => {
          if (file.isBuffer()) {
            try {
              const minified = await htmlmin(String(file.contents), {
                collapseWhitespace: true,
                removeComments: false, // On garde false pour les commentaires conditionnels
                removeEmptyAttributes: true,
                minifyCSS: true,
                conservativeCollapse: false, // Changé à false pour minifier plus agressivement
                preserveLineBreaks: false, // Changé à false pour supprimer les sauts de ligne
                processConditionalComments: true, // Changé à true pour traiter les commentaires conditionnels
                minifyJS: true,
                caseSensitive: true, // Important pour les éléments MSO
                keepClosingSlash: true, // Important pour la compatibilité email
                html5: false // Important pour la compatibilité email
              });
              file.contents = Buffer.from(minified);
              //console.log(`Minified file: ${file.path}`);
            } catch (error) {
              console.error(`Error minifying file: ${file.path}`, error);
            }
          } else {
            console.warn(`File is not a buffer: ${file.path}`);
          }
          callback(null, file);
        }))
        .pipe(rename({ suffix: '.min' }))
        .pipe(gulp.dest('dist'))
        .on('end', () => {
          console.log('minifyHtml task completed.');
          resolve();
        });
    }, 500); // Délai de 500ms
  });
};

// Vérification du poids et des attributs alt
const customFilesize = () => {
  return through2.obj(function (file, _, cb) {
    if (file.isBuffer()) {
      const fileSizeInKB = file.contents.length / 1024;
      const fileName = path.basename(file.path);
      console.log(`${fileName}: ${fileSizeInKB.toFixed(2)} Ko`);
    } else {
      console.warn(`File is not a buffer: ${file.path}`);
    }
    cb(null, file);
  });
};

const verification = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('Starting verification task...');
      gulp.src('dist/*.html')
        .pipe(customFilesize())
        .pipe(gulp.dest('dist'))
        .on('end', () => {
          console.log('verification task completed.');
          resolve();
        });
    }, 500); // Délai de 500ms
  });
};

// Watch
const watch = () => {
  gulp.watch('./src/**/*.pug', gulp.series(pugToMjml, mjmlToHtml, minifyHtml, verification));
};

// Tâche par défaut
const defaultTask = gulp.series(
  cleanDist,
  ensureDistDirectory,
  pugToMjml,
  mjmlToHtml,
  (done) => {
    setTimeout(() => {
      gulp.series(minifyHtml, verification, serve, watch)(done);
    }, 500);
  }
);

// Export des tâches
export { serve, verification, cleanDist, pugToMjml, mjmlToHtml, minifyHtml, watch, defaultTask as default };