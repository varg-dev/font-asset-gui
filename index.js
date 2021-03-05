
class Renderer extends gloperate.Renderer {

    _camera;                // : gloperate.Camera
    _navigation;            // : gloperate.Navigation

    _depthRenderbuffer;     // : gloperate.Renderbuffer
    _colorRenderTexture;    // : gloperate.Texture2D
    _intermediateFBO;       // : gloperate.Framebuffer

    _ndcFillingTriangle;    // : gloperate.NdcFillingTriangle
    _ndcOffsetKernel;       // : gloperate.AntiAliasingKernel
    // _uNdcOffset;            // : WebGLUniformLocation

    _program;               // : gloperate.Program
    // _uViewProjection;       // : WebGLUniformLocation

    _defaultFBO;            // : gloperate.DefaultFramebuffer

    _accumulate;            // : gloperate.AccumulatePass
    _blit;                  // : gloperate.BlitPass

    _labelPass;		        // : gloperate.LabelRenderPass;
    _labels;		        // : Array of gloperate:Labels


    onInitialize(context, callback, eventProvider) {
    
        const gl = context.gl;
        const gl2facade = this._context.gl2facade;
    
        this._defaultFBO = new gloperate.DefaultFramebuffer(context, 'DefaultFBO');
        this._defaultFBO.initialize();

        const internalFormatAndType = gloperate.Wizard.queryInternalTextureFormat(this._context,
            gl.RGBA, gloperate.Wizard.Precision.half);

        this._colorRenderTexture = new gloperate.Texture2D(this._context, 'ColorRenderTexture');
        this._colorRenderTexture.initialize(1, 1, internalFormatAndType[0], gl.RGBA, internalFormatAndType[1]);
        this._colorRenderTexture.filter(gl.LINEAR, gl.LINEAR);

        this._depthRenderbuffer = new gloperate.Renderbuffer(this._context, 'DepthRenderbuffer');
        this._depthRenderbuffer.initialize(1, 1, gl.DEPTH_COMPONENT16);

        this._intermediateFBO = new gloperate.Framebuffer(this._context, 'IntermediateFBO');
        this._intermediateFBO.initialize([
            [gl2facade.COLOR_ATTACHMENT0, this._colorRenderTexture],
            [gl.DEPTH_ATTACHMENT, this._depthRenderbuffer]]);

        // this._uViewProjection = this._program.uniform('u_viewProjection');
        // this._uNdcOffset = this._program.uniform('u_ndcOffset');


        // this._texture = new Texture2D(context, 'Texture');
        // this._texture.initialize(1, 1, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE);
        // this._texture.wrap(gl.REPEAT, gl.REPEAT);
        // this._texture.filter(gl.LINEAR, gl.LINEAR_MIPMAP_LINEAR);
        // this._texture.maxAnisotropy(Texture2D.MAX_ANISOTROPY);

        // this._texture.fetch('/examples/data/blue-painted-planks-diff-1k-modified.webp').then(() => {
        //     const gl = context.gl;

        //     this._program.bind();
        //     gl.uniform1i(this._program.uniform('u_textured'), true);

        //     this.finishLoading();
        //     this.invalidate(true);
        // });

        this._camera = new gloperate.Camera();
        this._camera.center = gloperate.vec3.fromValues(0.0, 0.0, 0.0);
        this._camera.up = gloperate.vec3.fromValues(0.0, 1.0, 0.0);
        this._camera.eye = gloperate.vec3.fromValues(0.0, 0.0, 5.0);
        this._camera.near = 1.0;
        this._camera.far = 8.0;


        this._navigation = new gloperate.Navigation(callback, eventProvider);
        this._navigation.camera = this._camera;

        this._ndcTriangle = new gloperate.NdcFillingTriangle(context);
        this._ndcTriangle.initialize(); 

        this._accumulate = new gloperate.AccumulatePass(context);
        this._accumulate.initialize(this._ndcTriangle);
        this._accumulate.precision = this._framePrecision;
        this._accumulate.texture = this._colorRenderTexture;
        this._accumulate.update();

        this._blit = new gloperate.BlitPass(this._context);
        this._blit.initialize(this._ndcTriangle);
        this._blit.readBuffer = gl2facade.COLOR_ATTACHMENT0;
        this._blit.target = this._defaultFBO;
        this._blit.drawBuffer = gl.BACK;


        // this._labelPass = new gloperate.LabelRenderPass(context);
        // this._labelPass.initialize();
        // this._labelPass.camera = this._camera;
        // this._labelPass.target = this._defaultFBO;
        // this._labelPass.depthMask = true;
        // this._labelPass.aaStepScale = 0.5;
        // this._labelPass.aaSampling = gloperate.LabelRenderPass.Sampling.Grid4x4;
        // this._labelPass.depthFunc = context.gl.LESS;

        // gloperate.FontFace.fromFile('./assets/roboto.fnt', context)
        //     .then((fontFace) => {

        //         // >> CHANGE LABELING TEXTS, POSITIONS, COLOR, AND MORE HERE:
        //         // >> note: dynamic labels need to altered manually... (see on Frame)

        //         var labels = new Array(3);

        //         labels[0] = new gloperate.Position3DLabel(new gloperate.Text('Scatterplot'), gloperate.Label.Type.Static);
        //         labels[0].lineAnchor = gloperate.Label.LineAnchor.Bottom;
        //         labels[0].alignment = gloperate.Label.Alignment.Center;
        //         labels[0].position = [0.0, 0.0, 0.0];
        //         labels[0].direction = [1.0, 1.0, -1.0];
        //         labels[0].up = [-1.5, 0.5, -1.0];
        //         labels[0].fontSize = 0.3;
        //         labels[0].fontSizeUnit = gloperate.Label.Unit.World;
        //         labels[0].color.fromHex('#ffffff');

        //         // labels[1] = new gloperate.Position3DLabel(new gloperate.Text('3D'), gloperate.Label.Type.Static);
        //         // labels[1].lineAnchor = gloperate.Label.LineAnchor.Top;
        //         // labels[1].alignment = gloperate.Label.Alignment.Center;
        //         // labels[1].position = [-0.1, 0.2, 0.0];
        //         // labels[1].direction = [1.0, 1.0, -1.0];
        //         // labels[1].up = [-0.5, 1.5, +1.0];
        //         // labels[1].fontSize = 1.2;
        //         // labels[1].fontSizeUnit = gloperate.Label.Unit.World;
        //         // labels[1].color.fromHex('#888888');

        //         // labels[2] = new gloperate.Position3DLabel(new gloperate.Text('Probably the x-Axis'), gloperate.Label.Type.Static);
        //         // labels[2].lineAnchor = gloperate.Label.LineAnchor.Bottom;
        //         // labels[2].alignment = gloperate.Label.Alignment.Center;
        //         // labels[2].position = [0.0, -1.1, -1.1];
        //         // labels[2].up = [0.0, 0.0, -1.0];
        //         // labels[2].direction = [1.0, 0.0, 0.0];
        //         // labels[2].fontSize = 0.2;
        //         // labels[2].fontSizeUnit = gloperate.Label.Unit.World;
        //         // labels[2].color.fromHex('#ff00ff');

        //         // labels[3] = new gloperate.Projected3DLabel(new gloperate.Text('   Point'), gloperate.Label.Type.Dynamic);
        //         // labels[3].lineAnchor = gloperate.Label.LineAnchor.Bottom;
        //         // labels[3].alignment = gloperate.Label.Alignment.Left;
        //         // labels[3].position = [-1.0, +1.0, +1.0];
        //         // labels[3].fontSize = 16.0;
        //         // labels[3].fontSizeUnit = gloperate.Label.Unit.Mixed;
        //         // labels[3].color.fromHex('#00ffff');

        //         for (var label of labels) {
        //             label.fontFace = fontFace;
        //         }
        //         this._labelPass.labels = labels;
        //         this._labelPass.update();

        //         this._labels = labels;

        //         this.invalidate(true);
        //     })
        //     .catch((reason) => gloperate.auxiliaries.log(
        //         gloperate.auxiliaries.LogLevel.Error, reason));


        return true;
    }

    onUninitialize() {
        super.uninitialize();

        this._cuboid.uninitialize();
        this._program.uninitialize();

        this._defaultFBO.uninitialize();
        this._accumulate.uninitialize();

        
        this._labelPass.uninitialize();
    }


    onDiscarded() {
        this._altered.alter('canvasSize');
        this._altered.alter('clearColor');
        this._altered.alter('frameSize');
        this._altered.alter('multiFrameNumber');
    }

    onUpdate() { 
        this._navigation.update();

        return this._altered.any || this._camera.altered;       
        // return true; // continuous rendering
    }

    onPrepare() {

        if (this._altered.frameSize) {
            this._intermediateFBO.resize(this._frameSize[0], this._frameSize[1]);
            this._camera.viewport = this._canvasSize;

            this._camera.aspect = this._canvasSize[0] / this._canvasSize[1];
            this._camera.viewport = this._canvasSize;
        }


        if (this._altered.clearColor) {
            this._defaultFBO.clearColor(this._clearColor);
            this._intermediateFBO.clearColor(this._clearColor);
        }

        if (this._altered.multiFrameNumber) {
            this._ndcOffsetKernel = new gloperate.AntiAliasingKernel(this._multiFrameNumber);
        }

        this._accumulate.update();

        this._altered.reset();
        this._camera.altered = false;
    }

    onFrame(frameNumber) {
        const gl = this._context.gl;

        this._intermediateFBO.bind();
        this._intermediateFBO.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, false, false);


        gl.viewport(0, 0, this._frameSize[0], this._frameSize[1]);

        const ndcOffset = this._ndcOffsetKernel.get(frameNumber);
        ndcOffset[0] = 2.0 * ndcOffset[0] / this._frameSize[0];
        ndcOffset[1] = 2.0 * ndcOffset[1] / this._frameSize[1];


        gl.enable(gl.DEPTH_TEST);

        // this._program.bind();


        // gl.uniform2fv(this._uNdcOffset, ndcOffset);


        // this._ndcRectangle.bind();
        // this._ndcRectangle.draw();
        // this._ndcRectangle.unbind();

        // this._program.unbind();
        this._intermediateFBO.unbind();
        
        // this._texture.unbind(gl.TEXTURE0);


        this._accumulate.frame(frameNumber);
    }

    onSwap() { 
        this._blit.framebuffer = this._accumulate.framebuffer ?
        this._accumulate.framebuffer : this._intermediateFBO;
        this._blit.frame();

        // this._blit.srcBounds = this._zoomSrcBounds;
        // this._blit.dstBounds = this._zoomDstBounds;
        // this._blit.frame();
        // this._blit.srcBounds = this._blit.dstBounds = undefined;
    }

    compute(identifier, size, samples) {  
        // this._queue.push([ identifier, Math.min(8192, Math.max(8, size)), samples, this._debug ]);
        // this.invalidate();
    }

    input(file, callback) {

        // var fr = new FileReader();
        // fr.onload = () => {
        //     // this._fontTexture.load(fr.result).then(() => {
        //     //     const gl = this._context.gl;

        //     //     this._fontTexture.bind(gl.TEXTURE0);
        //     //     this._fontTexture.wrap(gl.REPEAT, gl.REPEAT, false, false);
        //     //     this._fontTexture.filter(gl.LINEAR, gl.LINEAR, false, false); 

        //     //     this._debug = false;

        //     //     callback();
        //     // });
        // };
        // fr.readAsDataURL(file);
    }

}


// Renderer.prototype.SHADER_SOURCE_VERT = `
// precision highp float;
// precision highp int;

// #if __VERSION__ == 100
//     attribute vec2 a_vertex;
// #else
//     in vec2 a_vertex;
//     #define varying out
// #endif

// uniform vec2 u_ndcOffset;

// varying vec2 v_uv;

// void main(void)
// {
//     vec2 v = a_vertex;
//     v_uv = a_vertex;
    
//     gl_Position = vec4(a_vertex.xy + u_ndcOffset, 0.0, 1.0);
// }
// `;


// Renderer.prototype.SHADER_SOURCE_FRAG = `
// precision highp float;
// precision highp int;

// #if __VERSION__ == 100
//     #define fragColor gl_FragColor
//     #define texture texture2D
// #else
//     layout(location = 0) out vec4 fragColor;
//     #define varying in
// #endif

// uniform sampler2D u_font;

// varying vec2 v_uv;

// void main(void)
// {
//     fragColor = texture(u_font, v_uv);
// }
// `;

