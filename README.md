# Video converter

## Correcciones de exportación

- Cada oración ocupa líneas independientes y conserva su posición durante la grabación.
- El texto se ajusta al recuadro. Si no entra a un tamaño mínimo, la exportación avisa en lugar de recortarlo silenciosamente.
- La narración se genera por oración. Sus duraciones reales definen los tiempos de resaltado y la duración mínima de cada diapositiva.
- El texto permanece visible. Con animación de texto habilitada, la oración que coincide literalmente con la narración se resalta mientras se reproduce. Las notas que parafrasean el contenido no producen resaltados inventados.
- Audio y dibujo comparten el reloj de Web Audio. El audio se programa antes de grabar, sin depender de los fotogramas para iniciar cada oración.
- El primer fotograma contiene la diapositiva completa. No hay entradas de texto con pantalla vacía entre diapositivas.
- Las imágenes animadas permanecen dentro de sus cajas. Se incluyen fondos de imagen y se conserva la proporción de la diapositiva al exportar en otro formato.
- La importación ya no impone un tamaño mínimo del 4 % a cada objeto ni elimina números del guion.
- Si una imagen o una locución falla, se interrumpe la exportación con un mensaje. La previsualización se pausa al abrir el exportador.

## Uso en AI Studio

Incorporar estos archivos al repositorio y sincronizar los cambios hacia AI Studio desde su pestaña GitHub. Volver a importar la presentación para aplicar la corrección de coordenadas. Probar primero una diapositiva con varias oraciones y luego generar el video completo. Mantener la pestaña visible durante la grabación.

La configuración existente de Google, Firebase y `GEMINI_API_KEY` se conserva. No se incluyen credenciales nuevas.

## Validación y límites

Se verificaron TypeScript, la compilación de la interfaz y seis pruebas de regresión. Se generó un MP4 en el navegador con dos diapositivas locales y buffers de audio sintéticos de duración conocida; se inspeccionaron la distribución del texto y el resaltado. Esa prueba no valida pronunciación ni respuestas reales de Gemini.

Falta validar el PPT importado por Google Slides y la locución real en el entorno del propietario. La previsualización principal conserva su motor de voz anterior y sus tiempos orientativos; la sincronización por oración se aplica al archivo generado y a su reproductor de revisión. El importador sigue usando un estilo principal por cuadro de texto, por lo que no reproduce todos los formatos mixtos de PowerPoint.

## Desarrollo

Instalar dependencias con `npm install`, ejecutar `npm run dev`, revisar tipos con `npm run lint` y ejecutar las pruebas con `npm test`. `npm run build` conserva el comando original de compilación del proyecto.

En el entorno restringido de validación se compiló la interfaz con la carga nativa de configuración de Vite y una copia temporal de la configuración que usa `import.meta.dirname`. Las pruebas se ejecutaron tras compilarlas con TypeScript a CommonJS porque el lanzador `tsx` no pudo consultar el usuario del sistema. No se modificó la configuración original por esas restricciones locales.
